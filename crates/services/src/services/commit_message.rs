use serde::{Deserialize, Serialize};
use thiserror::Error;
use utils::diff::Diff;

#[derive(Debug, Error)]
pub enum CommitMessageError {
    #[error("DEEPSEEK_API_KEY environment variable is not set")]
    ApiKeyNotSet,
    #[error("DeepSeek API error: {0}")]
    ApiError(String),
    #[error("Empty response from DeepSeek API")]
    EmptyResponse,
    #[error("Network error: {0}")]
    NetworkError(#[from] reqwest::Error),
}

const MAX_DIFF_CONTEXT_CHARS: usize = 12000;
const MAX_FILE_CONTENT_CHARS: usize = 2000;

#[derive(Debug, Clone)]
pub struct DiffSummary {
    pub files_changed: usize,
    pub lines_added: usize,
    pub lines_removed: usize,
}

/// Truncate text to a maximum length
fn truncate_text(text: &str, max_chars: usize) -> String {
    if text.len() <= max_chars {
        text.to_string()
    } else {
        format!("{}\n... [truncated]", &text[..max_chars])
    }
}

/// Summarize diffs to get statistics
pub fn summarize_diffs(diffs: &[Diff]) -> DiffSummary {
    let mut summary = DiffSummary {
        files_changed: 0,
        lines_added: 0,
        lines_removed: 0,
    };

    for diff in diffs {
        summary.files_changed += 1;
        summary.lines_added += diff.additions.unwrap_or(0);
        summary.lines_removed += diff.deletions.unwrap_or(0);
    }

    summary
}

/// Build diff context string from diffs
pub fn build_diff_context(diffs: &[Diff]) -> String {
    if diffs.is_empty() {
        return String::new();
    }

    let mut sections: Vec<String> = Vec::new();
    let mut total_chars = 0usize;

    for diff in diffs {
        let path = diff
            .new_path
            .as_deref()
            .or(diff.old_path.as_deref())
            .unwrap_or("unknown");
        let mut section = format!("File: {}\nChange: {:?}\n", path, diff.change);

        if diff.content_omitted {
            section.push_str(&format!(
                "Content omitted. Additions: {}, Deletions: {}\n",
                diff.additions.unwrap_or(0),
                diff.deletions.unwrap_or(0)
            ));
        } else {
            if let Some(old_content) = diff.old_content.as_deref() {
                section.push_str("--- Old\n");
                section.push_str(&truncate_text(old_content, MAX_FILE_CONTENT_CHARS));
                section.push('\n');
            }
            if let Some(new_content) = diff.new_content.as_deref() {
                section.push_str("--- New\n");
                section.push_str(&truncate_text(new_content, MAX_FILE_CONTENT_CHARS));
                section.push('\n');
            }
        }

        section.push('\n');

        if total_chars + section.len() > MAX_DIFF_CONTEXT_CHARS {
            sections.push("... diff context truncated ...".to_string());
            break;
        }

        total_chars += section.len();
        sections.push(section);
    }

    sections.join("\n")
}

/// Build commit message prompt for task branch commits
pub fn build_branch_commit_prompt(
    task_title: &str,
    task_description: Option<&str>,
    target_branch: &str,
    summary: &DiffSummary,
    diff_context: &str,
) -> String {
    let title = task_title.trim();
    let description = task_description.unwrap_or("").trim();

    let mut prompt = String::from(
        "你是一个 Git 提交信息生成器。\n\
请生成中文的标准 Git commit message（用于任务分支提交）。\n\n\
规则：\n\
- 只输出提交信息本体，不要附加解释、编号或代码块。\n\
- 第一行使用 Conventional Commits 格式，例如：\n\
  fix(ui): 修复按钮点击无响应问题\n\
  docs: 更新API接口文档\n\
  refactor(core): 重构登录模块代码结构\n\
- 第一行尽量简洁（<= 72 字符）。\n\
- 如需正文，第二行留空，从第三行开始写 1-3 句中文说明。\n\
- 重点说明「改了什么、为什么改」。避免泛泛的「更新文件/合并分支」。\n\n",
    );

    prompt.push_str(&format!("Task title: {}\n", title));
    if !description.is_empty() {
        prompt.push_str(&format!("Task description: {}\n", description));
    }
    prompt.push_str(&format!("Target branch: {}\n", target_branch));
    prompt.push_str(&format!(
        "Diff summary: {} files, +{} / -{} lines\n\n",
        summary.files_changed, summary.lines_added, summary.lines_removed
    ));

    if !diff_context.trim().is_empty() {
        prompt.push_str("Diff context:\n");
        prompt.push_str(diff_context.trim());
        prompt.push('\n');
    }

    prompt
}

/// Generate commit message using DeepSeek API
pub async fn generate_commit_message(prompt: &str) -> Result<String, CommitMessageError> {
    #[derive(Serialize)]
    struct DeepseekMessage {
        role: String,
        content: String,
    }

    #[derive(Serialize)]
    struct DeepseekRequest {
        model: String,
        messages: Vec<DeepseekMessage>,
        temperature: f32,
        max_tokens: u32,
    }

    #[derive(Deserialize)]
    struct DeepseekResponse {
        choices: Vec<DeepseekChoice>,
    }

    #[derive(Deserialize)]
    struct DeepseekChoice {
        message: DeepseekResponseMessage,
    }

    #[derive(Deserialize)]
    struct DeepseekResponseMessage {
        content: String,
    }

    let api_key =
        std::env::var("DEEPSEEK_API_KEY").map_err(|_| CommitMessageError::ApiKeyNotSet)?;

    let payload = DeepseekRequest {
        model: "deepseek-chat".to_string(),
        messages: vec![
            DeepseekMessage {
                role: "system".to_string(),
                content: "You generate high-quality Git commit messages.".to_string(),
            },
            DeepseekMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            },
        ],
        temperature: 0.2,
        max_tokens: 240,
    };

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.deepseek.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(CommitMessageError::ApiError(format!(
            "{} {}",
            status.as_u16(),
            body.trim()
        )));
    }

    let data: DeepseekResponse = response.json().await?;
    let message = data
        .choices
        .first()
        .map(|choice| choice.message.content.trim().to_string())
        .unwrap_or_default();

    if message.is_empty() {
        return Err(CommitMessageError::EmptyResponse);
    }

    Ok(message)
}
