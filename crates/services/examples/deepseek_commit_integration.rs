/**
 * DeepSeek Commit Message Generator Example
 *
 * Complete integration example showing how to use CommitPromptGenerator
 * with DeepSeek API for generating commit messages
 */

use services::{CommitFormatConfig, CommitPromptGenerator};

fn main() {
    // 从环境变量读取配置
    let language = std::env::var("DEEPSEEK_COMMIT_LANGUAGE")
        .unwrap_or_else(|_| "English".to_string());

    let config = CommitFormatConfig {
        language,
        enable_emoji: true,
        enable_body: true,
        enable_merge_commit: false,
    };

    // 生成系统提示词
    let system_prompt = CommitPromptGenerator::generate_system_prompt(&config);

    println!("=== Generated System Prompt for DeepSeek ===\n");
    println!("{}", system_prompt);

    // 示例用户消息（实际使用时应该是真实的 git diff）
    let example_diff = r#"
diff --git a/crates/services/src/ai/prompts/commit_message_prompt.rs b/crates/services/src/ai/prompts/commit_message_prompt.rs
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/crates/services/src/ai/prompts/commit_message_prompt.rs
@@ -0,0 +1,50 @@
+/**
+ * Commit Message Generation Prompt
+ *
+ * Based on dish-ai-commit (MIT License)
+ * Copyright © 2024 littleCareless
+ */
+
+use serde::Serialize;
+
+#[derive(Debug, Clone, Serialize)]
+pub struct CommitFormatConfig {
+    pub enable_merge_commit: bool,
+    pub enable_emoji: bool,
+    pub enable_body: bool,
+    pub language: String,
+}
+
+pub struct CommitPromptGenerator;
+
+impl CommitPromptGenerator {
+    pub fn generate_system_prompt(config: &CommitFormatConfig) -> String {
+        // ... implementation
+    }
+}
"#;

    println!("\n=== Example User Message ===\n");
    println!("Please generate a commit message for the following code changes:\n");
    println!("{}", example_diff);

    println!("\n=== How to call DeepSeek API ===\n");
    println!(
        r#"
// 1. Send this system prompt and the diff to DeepSeek API:
//
//    POST https://api.deepseek.com/v1/chat/completions
//    Authorization: Bearer <DEEPSEEK_API_KEY>
//
//    {{
//      "model": "deepseek-chat",
//      "messages": [
//        {{
//          "role": "system",
//          "content": "<system_prompt>..."
//        }},
//        {{
//          "role": "user",
//          "content": "Please generate a commit message for:\n\n<diff>"
//        }}
//      ],
//      "temperature": 0.3,
//      "max_tokens": 500
//    }}

// 2. The AI should respond with a properly formatted commit message like:
//
//    ✨ feat(ai): add commit message prompt generator based on dish-ai-commit
//
//    - integrate CommitFormatConfig struct for flexible configuration
//    - implement CommitPromptGenerator with multi-language support
//    - add emoji support for conventional commits
//    - provide self-verification checklist in prompt
//    - include comprehensive examples and guidelines

"#
    );
}

/*

USAGE GUIDE FOR DeepSeek INTEGRATION:

1. Basic Usage in Rust:

```rust
use services::{CommitFormatConfig, CommitPromptGenerator};

async fn generate_commit_with_deepseek(diff: String) -> Result<String> {
    let config = CommitFormatConfig {
        language: "Chinese".to_string(),
        enable_emoji: true,
        enable_body: true,
        enable_merge_commit: false,
    };

    let system_prompt = CommitPromptGenerator::generate_system_prompt(&config);

    // Call DeepSeek API
    let response = call_deepseek_api(&system_prompt, &diff).await?;

    Ok(response)
}
```

2. Configuration Options:

CommitFormatConfig supports these fields:
- language: "English", "Chinese", "日本語", etc.
- enable_emoji: true/false (show emoji in commit types)
- enable_body: true/false (include detailed body)
- enable_merge_commit: true/false (merge multiple files into one commit)

3. Supported Languages:

The prompt template supports any language:
- English
- 简体中文 (Chinese Simplified)
- 繁體中文 (Chinese Traditional)
- 日本語 (Japanese)
- 한국어 (Korean)
- Español (Spanish)
- Français (French)
- Deutsch (German)
- Русский (Russian)
- etc.

4. Example with Environment Variables:

```rust
fn get_config_from_env() -> CommitFormatConfig {
    CommitFormatConfig {
        language: std::env::var("DEEPSEEK_COMMIT_LANGUAGE")
            .unwrap_or_else(|_| "English".to_string()),
        enable_emoji: std::env::var("DEEPSEEK_ENABLE_EMOJI")
            .map(|v| v == "true")
            .unwrap_or(true),
        enable_body: std::env::var("DEEPSEEK_ENABLE_BODY")
            .map(|v| v == "true")
            .unwrap_or(true),
        enable_merge_commit: std::env::var("DEEPSEEK_MERGE_COMMIT")
            .map(|v| v == "true")
            .unwrap_or(false),
    }
}
```

5. Expected Output Format:

The AI should generate commits in one of these formats:

- With emoji (enabled):
  ✨ feat(scope): description

  - bullet point explanation

- Without emoji:
  feat(scope): description

  - bullet point explanation

- Breaking changes:
  ✨ feat(scope)!: breaking change description

  -【Breaking Change】old behavior
  -【Migration】how to migrate

6. Quality Assurance:

The prompt includes these verification checks:
- Language correctness (must be in target language except for scope/technical terms)
- Format compliance (must follow type(scope): subject)
- Content clarity (only commit message, no explanations)
- Consistency (multiple commits must be consistent)
- Completeness (all necessary information included)

7. Temperature Setting:

For commit messages, recommend using low temperature values:
- temperature: 0.1 - Very deterministic, highly consistent
- temperature: 0.3 - Good balance (recommended)
- temperature: 0.5 - More creative, slightly variable
- temperature: 0.7+ - Very creative, may be less consistent

8. Prompt Structure:

The prompt is organized in this order:
1. CRITICAL INSTRUCTION (strict requirements)
2. REQUIRED ACTIONS (what must be done)
3. PROHIBITED ACTIONS (what must not be done)
4. FORMAT TEMPLATE (exact format to follow)
5. TYPE DETECTION GUIDE (how to analyze changes)
6. TYPE REFERENCE (commit types and examples)
7. WRITING RULES (specific rules for subject/body)
8. SELF-VERIFICATION CHECKLIST (verification steps)
9. EXAMPLES (good examples to follow)
10. COMMON MISTAKES (mistakes to avoid)
11. THINKING PROCESS (step-by-step reasoning)

*/
