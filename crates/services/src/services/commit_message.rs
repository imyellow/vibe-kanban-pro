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

/// Truncate text to a maximum length (UTF-8 safe)
fn truncate_text(text: &str, max_bytes: usize) -> String {
    if text.len() <= max_bytes {
        text.to_string()
    } else {
        // Find a valid UTF-8 character boundary
        let mut end = max_bytes;
        while end > 0 && !text.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}\n... [truncated]", &text[..end])
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

/// Get the commit message language from environment variable
fn get_commit_language() -> String {
    std::env::var("DEEPSEEK_COMMIT_LANGUAGE").unwrap_or_else(|_| "English".to_string())
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
    let language = get_commit_language();

    let mut prompt = format!(
        "You are a Git commit message generator.\n\
Please generate a standard Git commit message in {language} (for task branch commits).\n\n\
Rules:\n\
- Output only the commit message itself, without explanations, numbering, or code blocks.\n\
- Use Conventional Commits format for the first line, e.g.:\n\
  fix(ui): fix button click not responding\n\
  docs: update API documentation\n\
  refactor(core): restructure login module code\n\
- Keep the first line concise (<= 72 characters).\n\
- If a body is needed, leave the second line blank, then write 1-3 sentences starting from the third line.\n\
- Focus on explaining \"what changed and why\". Avoid generic messages like \"update files/merge branch\".\n\
- IMPORTANT: The commit message MUST be written in {language}.\n\n",
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

    let base_url = std::env::var("DEEPSEEK_BASE_URL")
        .unwrap_or_else(|_| "https://api.deepseek.com/v1".to_string());
    
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

    let response = client
        .post(&url)
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
