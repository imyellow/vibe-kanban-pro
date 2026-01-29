/**
 * Commit Message Generation Prompt
 *
 * Based on dish-ai-commit (MIT License)
 * Copyright © 2024 littleCareless
 *
 * Adapted for vibe-kanban project with DeepSeek integration
 * Original prompt template preserved from the source project
 */

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct CommitFormatConfig {
    pub enable_merge_commit: bool,
    pub enable_emoji: bool,
    pub enable_body: bool,
    pub language: String,
}

impl Default for CommitFormatConfig {
    fn default() -> Self {
        Self {
            enable_merge_commit: false,
            enable_emoji: true,
            enable_body: true,
            language: "English".to_string(),
        }
    }
}

pub struct CommitPromptGenerator;

impl CommitPromptGenerator {
    pub fn generate_system_prompt(config: &CommitFormatConfig) -> String {
        let mut parts = Vec::new();

        // Header
        parts.push(format!(
            r#"# GIT Commit Message Guide

**CRITICAL INSTRUCTION: YOU MUST FOLLOW THESE EXACT REQUIREMENTS**
1. OUTPUT ONLY THE COMMIT MESSAGE IN {}
2. FOLLOW THE FORMAT EXACTLY AS SHOWN IN EXAMPLES
3. INCLUDE NO EXPLANATIONS OR ADDITIONAL TEXT
4. NEVER USE ENGLISH UNLESS SPECIFIED"#,
            config.language
        ));

        // Required Actions
        let emoji_status = if config.enable_emoji { "ENABLED" } else { "DISABLED" };
        let merge_action = if config.enable_merge_commit {
            "MERGE all changes into a SINGLE commit message"
        } else {
            "CREATE SEPARATE commit messages for each file"
        };
        let body_action = if config.enable_body {
            "INCLUDE body content that explains the changes in detail"
        } else {
            "DO NOT include body content, ONLY generate the subject line"
        };

        parts.push(format!(
            r#"
## REQUIRED ACTIONS (MUST DO)

1. Determine the true intention of this commit based on the actual changes (including path, file name, content, and diff code), and choose the commit type that best suits the purpose.
2. WRITE ALL CONTENT IN {} (except for technical terms and scope)
3. FOLLOW THE EXACT FORMAT TEMPLATE shown in examples
4. USE ENGLISH ONLY FOR SCOPE and technical terms
5. INCLUDE APPROPRIATE EMOJI when enabled ({})
6. {}
7. {}"#,
            config.language, emoji_status, merge_action, body_action
        ));

        // Prohibited Actions
        parts.push(
            r#"
## PROHIBITED ACTIONS (MUST NOT DO)

1. DO NOT include any explanations, greetings, or additional text
2. DO NOT write in English (except for technical terms and scope)
3. DO NOT add any formatting instructions or metadata
4. DO NOT include triple backticks (```) in your output
5. DO NOT add any comments or questions
6. DO NOT deviate from the required format"#
                .to_string(),
        );

        // Format Template
        let merge_section = Self::get_merge_commits_section(
            config.enable_merge_commit,
            config.enable_emoji,
            config.enable_body,
        );
        parts.push(format!(
            r#"
## FORMAT TEMPLATE

{}"#,
            merge_section
        ));

        // Type Detection Guide
        parts.push(
            r#"
## TYPE DETECTION GUIDE

When generating commit messages, always consider both the file status and the content changes:

### File Status Classification

- Please analyze the file changes — including file paths, filenames, file contents, and diff code snippets — and determine the purpose of this commit.
- Then, choose the most appropriate commit type (type) from the TYPE REFERENCE list based on the actual intent of the change, not just the file extension or filename.
- The commit type must reflect the **real purpose** of the change.

### Special Case: Rename Operations

When you see markers like:
```
### RENAME OPERATION ###
# File renamed from: old-file.js
# File renamed to: new-file.js
rename from old-file.js
rename to new-file.js
```

This indicates a file rename operation. For rename:
- Use appropriate type (usually `refactor`, `chore`, or `style`)
- Mention both old and new filenames clearly
- Example: `refactor(core): rename old-file to new-file for better clarity`"#
                .to_string(),
        );

        // Type Reference
        let type_reference = Self::get_type_reference(config.enable_emoji);
        parts.push(format!(
            r#"
## TYPE REFERENCE

{}"#,
            type_reference
        ));

        // Writing Rules
        let body_section = if config.enable_body {
            format!(
                r#"

### Body
- Breaking Changes must include detailed impact description
- Use bullet points with "-"
- Maximum 72 characters per line
- Explain what and why
- Must be in {}
- Use【】for categorizing different types of changes"#,
                config.language
            )
        } else {
            String::new()
        };

        parts.push(format!(
            r#"
## WRITING RULES

### Subject Line
- Use ! for Breaking Changes: `feat(auth)!: ...`
- Scope must be in English
- Use imperative mood
- No capitalization
- No period at end
- Maximum 50 characters
- Must be in {} (except scope)
- The body MUST begin one blank line after the description
> If you cannot clearly classify a specific module or function, you can use `core` or `misc` as the default scope{}"#,
            config.language, body_section
        ));

        // Self-Verification Checklist
        let body_check = if config.enable_body {
            "6. BODY CHECK: Does the body explain what was changed and why?"
        } else {
            "6. SUBJECT-ONLY CHECK: Does the output contain ONLY the subject line with no body?"
        };

        parts.push(format!(
            r#"
## SELF-VERIFICATION CHECKLIST

Before finalizing your output, verify:
1. LANGUAGE CHECK: Is it 100% in {} (except for scope and technical terms)?
2. FORMAT CHECK: Does it strictly follow the "<type>(<scope>): <subject>" format?
3. CONTENT CHECK: Does it contain ONLY the commit message with no extra text?
4. CONSISTENCY CHECK: For multiple files, is the format consistent?
5. COMPLETENESS CHECK: Does it include all necessary information?
{}"#,
            config.language, body_check
        ));

        // Examples
        let examples = Self::get_git_examples(
            config.enable_merge_commit,
            config.enable_emoji,
            config.enable_body,
        );
        parts.push(format!(
            r#"
## EXAMPLES OF CORRECT OUTPUT

### Example (GIT)

{}"#,
            examples
        ));

        // Common Mistakes
        parts.push(format!(
            r#"
## COMMON MISTAKES TO AVOID

Avoid these common mistakes:

- Writing content in English (except for scope and technical terms); all other text must be in {}
- Adding explanatory text like "This commit adds..."
- Writing plain messages like "Fix login issue" without using the type(scope): format
- Forgetting the blank line between subject and body when body is enabled"#,
            config.language
        ));

        // Final Reminder
        let final_note = if !config.enable_body {
            "\n4. INCLUDE ONLY THE SUBJECT LINE, NO BODY"
        } else {
            ""
        };

        parts.push(format!(
            r#"

---

**FINAL REMINDER: YOUR OUTPUT MUST**
1. CONTAIN ONLY THE COMMIT MESSAGE WITH NOTHING ELSE
2. BE WRITTEN ENTIRELY IN {}
3. FOLLOW THE EXACT FORMAT SHOWN IN EXAMPLES{}"#,
            config.language, final_note
        ));

        // Thinking Process
        parts.push(
            r#"

# First, think step-by-step:

1. Analyze the CODE CHANGES thoroughly to understand what's been modified.
2. Use the ORIGINAL CODE to understand the context of the CODE CHANGES. Use the line numbers to map the CODE CHANGES to the ORIGINAL CODE.
3. Identify the purpose of the changes to answer the *why* for the commit message. To do this, synthesize information from all provided context.
4. Generate a thoughtful and succinct commit message for the given CODE CHANGES. It MUST follow the established writing conventions.
5. Remove any meta information like issue references, tags, or author names from the commit message. The developer will add them.
6. Now only show your message, wrapped with a single markdown `text` codeblock! Do not provide any explanations or details."#
                .to_string(),
        );

        parts.join("\n")
    }

    fn get_type_reference(enable_emoji: bool) -> String {
        if enable_emoji {
            r#"| Type     | Emoji | Description          | Example Scopes      |
| -------- | ----- | -------------------- | ------------------- |
| feat     | ✨    | New feature          | user, payment       |
| fix      | 🐛    | Bug fix              | auth, data          |
| docs     | 📝    | Documentation        | README, API         |
| style    | 💄    | Code style           | formatting          |
| refactor | ♻️    | Code refactoring     | utils, helpers      |
| perf     | ⚡️   | Performance          | query, cache        |
| test     | ✅    | Testing              | unit, e2e           |
| build    | 📦️    | Build system         | webpack, npm        |
| ci       | 👷    | CI config            | Travis, Jenkins     |
| chore    | 🔧    | Other changes        | scripts, config     |
| i18n     | 🌐    | Internationalization | locale, translation |"#
                .to_string()
        } else {
            r#"| Type     | Description          | Example Scopes      |
| -------- | -------------------- | ------------------- |
| feat     | New feature          | user, payment       |
| fix      | Bug fix              | auth, data          |
| docs     | Documentation        | README, API         |
| style    | Code style           | formatting          |
| refactor | Code refactoring     | utils, helpers      |
| perf     | Performance          | query, cache        |
| test     | Testing              | unit, e2e           |
| build    | Build system         | webpack, npm        |
| ci       | CI config            | Travis, Jenkins     |
| chore    | Other changes        | scripts, config     |
| i18n     | Internationalization | locale, translation |"#
                .to_string()
        }
    }

    fn get_merge_commits_section(
        enable_merge_commit: bool,
        enable_emoji: bool,
        enable_body: bool,
    ) -> String {
        let format_example = if enable_emoji {
            "<emoji> <type>(<scope>): <subject>"
        } else {
            "<type>(<scope>): <subject>"
        };

        if !enable_body {
            if !enable_merge_commit {
                format!(
                    r#"### Separate Commits

- If multiple file diffs are provided, generate separate commit messages for each file.
- If only one file diff is provided, generate a single commit message.
```
{}

{}
```"#,
                    format_example, format_example
                )
            } else {
                format!(
                    r#"### Merged Commit

If multiple file diffs are provided, merge them into a single commit message:
```
{}
```"#,
                    format_example
                )
            }
        } else if !enable_merge_commit {
            format!(
                r#"### Separate Commits

- If multiple file diffs are provided, generate separate commit messages for each file.
- If only one file diff is provided, generate a single commit message.
```
{}
<body for changes in file>

{}
<body for changes in file>
```"#,
                format_example, format_example
            )
        } else {
            format!(
                r#"### Merged Commit

If multiple file diffs are provided, merge them into a single commit message:
```
{}
<body of merged changes>
```"#,
                format_example
            )
        }
    }

    fn get_git_examples(
        enable_merge_commit: bool,
        enable_emoji: bool,
        enable_body: bool,
    ) -> String {
        if enable_merge_commit {
            Self::get_merged_git_example(enable_emoji, enable_body)
        } else {
            Self::get_separate_git_example(enable_emoji, enable_body)
        }
    }

    fn get_merged_git_example(use_emoji: bool, use_body: bool) -> String {
        let prefix = if use_emoji { "✨ " } else { "" };
        let body = if use_body {
            r#"

  - replace legacy token auth with JWT
  -【Breaking Change】old token format no longer supported
  -【Migration】clients must update authentication logic
  - implement token refresh mechanism"#
        } else {
            ""
        };

        format!(
            r#"#### Merged Commit (allowMergeCommits: true)

- **Input (Multiple Diffs)**:
  ```
  diff --git a/auth/index.ts b/auth/index.ts
  // ...diff content...
  ```

- **Generated Commit Message**:
  ```
  {}feat!(auth): implement new authentication system{}
  ```"#,
            prefix, body
        )
    }

    fn get_separate_git_example(use_emoji: bool, use_body: bool) -> String {
        let feat_prefix = if use_emoji { "✨ " } else { "" };
        let fix_prefix = if use_emoji { "🐛 " } else { "" };

        let feat_body = if use_body {
            "\n\n  - add feature implementation in feature.js"
        } else {
            ""
        };

        let fix_body = if use_body {
            "\n\n  - fixed calculation of variable y in bugfix.js"
        } else {
            ""
        };

        format!(
            r#"- **Input (Multiple File with Multiple Changes)**:
  ```
  diff --git a/feature.js b/feature.js
  index e69de29..b6fc4c6 100644
  --- a/feature.js
  +++ b/feature.js
  @@ -0,0 +1 @@
  +console.log('New Feature Implementation');

  diff --git a/bugfix.js b/bugfix.js
  index 1234567..7654321 100644
  --- a/bugfix.js
  +++ b/bugfix.js
  @@ -1,3 +1,3 @@
   const x = 1;
  -const y = x + 1;
  +const y = x + 2;
  ```

- **Generated Commit Messages**:
  ```
  {}feat(feature): implement new functionality{}

  {}fix(bugfix): correct calculation logic{}
  ```"#,
            feat_prefix, feat_body, fix_prefix, fix_body
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_system_prompt_default_config() {
        let config = CommitFormatConfig::default();
        let prompt = CommitPromptGenerator::generate_system_prompt(&config);

        assert!(prompt.contains("CRITICAL INSTRUCTION"));
        assert!(prompt.contains("REQUIRED ACTIONS"));
        assert!(prompt.contains("PROHIBITED ACTIONS"));
        assert!(prompt.contains("TYPE REFERENCE"));
        assert!(prompt.contains("SELF-VERIFICATION CHECKLIST"));
    }

    #[test]
    fn test_generate_system_prompt_with_emoji() {
        let config = CommitFormatConfig {
            enable_emoji: true,
            ..Default::default()
        };
        let prompt = CommitPromptGenerator::generate_system_prompt(&config);

        assert!(prompt.contains("✨"));
        assert!(prompt.contains("🐛"));
    }

    #[test]
    fn test_generate_system_prompt_without_emoji() {
        let config = CommitFormatConfig {
            enable_emoji: false,
            ..Default::default()
        };
        let prompt = CommitPromptGenerator::generate_system_prompt(&config);

        assert!(!prompt.contains("✨"));
        assert!(!prompt.contains("🐛"));
    }

    #[test]
    fn test_chinese_language() {
        let config = CommitFormatConfig {
            language: "简体中文".to_string(),
            ..Default::default()
        };
        let prompt = CommitPromptGenerator::generate_system_prompt(&config);

        assert!(prompt.contains("简体中文"));
    }
}
