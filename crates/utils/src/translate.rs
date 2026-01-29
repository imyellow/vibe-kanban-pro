use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::env;

const DEEPSEEK_API_URL: &str = "https://api.deepseek.com/chat/completions";

#[derive(Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessageResponse,
}

#[derive(Deserialize)]
struct ChatMessageResponse {
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

/// Translate text to English using DeepSeek API.
/// Returns the original text if translation fails or API key is not configured.
pub async fn translate_to_english(text: &str) -> String {
    let api_key = match env::var("DEEPSEEK_API_KEY") {
        Ok(key) if !key.is_empty() => key,
        _ => {
            tracing::debug!("DEEPSEEK_API_KEY not set, skipping translation");
            return text.to_string();
        }
    };

    let client = Client::new();

    let request = ChatRequest {
        model: "deepseek-chat".to_string(),
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: "You are a translator. Translate the following text to English. Only output the translation, nothing else. Keep it concise and suitable for a git branch name (short words preferred).".to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: text.to_string(),
            },
        ],
        temperature: 0.3,
        max_tokens: 100,
    };

    match client
        .post(DEEPSEEK_API_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
    {
        Ok(response) => {
            if let Ok(chat_response) = response.json::<ChatResponse>().await {
                if let Some(choice) = chat_response.choices.first() {
                    let translated = choice.message.content.trim().to_string();
                    tracing::debug!("Translated '{}' to '{}'", text, translated);
                    return translated;
                }
            }
            tracing::warn!("Failed to parse DeepSeek response for '{}'", text);
            text.to_string()
        }
        Err(e) => {
            tracing::warn!("DeepSeek API request failed: {}", e);
            text.to_string()
        }
    }
}

/// Check if a string contains only non-ASCII characters (e.g., Chinese, Japanese, Korean)
/// or produces an empty result when filtered to alphanumeric ASCII characters.
pub fn needs_translation(input: &str) -> bool {
    // Check if the lowercase version has any ASCII alphanumeric characters
    let has_ascii_alnum = input
        .chars()
        .any(|c| c.is_ascii_alphanumeric());

    !has_ascii_alnum
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_needs_translation() {
        // Chinese text - needs translation
        assert!(needs_translation("修复用户登录问题"));
        assert!(needs_translation("新增功能"));

        // English text - no translation needed
        assert!(!needs_translation("fix user login"));
        assert!(!needs_translation("Add new feature"));

        // Mixed text - has ASCII, no translation needed
        assert!(!needs_translation("Fix 用户登录"));
        assert!(!needs_translation("API 修复"));

        // Numbers only - no translation needed
        assert!(!needs_translation("123"));

        // Empty or special chars only - needs translation (will produce empty branch)
        assert!(needs_translation(""));
        assert!(needs_translation("！@#￥"));
    }
}
