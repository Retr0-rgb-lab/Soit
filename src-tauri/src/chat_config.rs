//! Wave C — BYOK chat config on disk (not universe.db).
//! Path: `{app_config_dir}/soit-chat.json`

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatConfigDto {
  #[serde(default)]
  pub base_url: String,
  #[serde(default)]
  pub model: String,
  #[serde(default)]
  pub api_key: String,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_config_dir()
    .map_err(|e| format!("app_config_dir: {e}"))?;
  fs::create_dir_all(&dir).map_err(|e| format!("create config dir: {e}"))?;
  Ok(dir.join("soit-chat.json"))
}

#[tauri::command]
pub fn get_chat_config(app: AppHandle) -> Result<ChatConfigDto, String> {
  let path = config_path(&app)?;
  if !path.exists() {
    return Ok(ChatConfigDto {
      base_url: "https://api.openai.com/v1".into(),
      model: "gpt-4o-mini".into(),
      api_key: String::new(),
    });
  }
  let raw = fs::read_to_string(&path).map_err(|e| format!("read chat config: {e}"))?;
  let mut cfg: ChatConfigDto =
    serde_json::from_str(&raw).map_err(|e| format!("parse chat config: {e}"))?;
  if cfg.base_url.trim().is_empty() {
    cfg.base_url = "https://api.openai.com/v1".into();
  }
  if cfg.model.trim().is_empty() {
    cfg.model = "gpt-4o-mini".into();
  }
  Ok(cfg)
}

#[tauri::command]
pub fn set_chat_config(app: AppHandle, config: ChatConfigDto) -> Result<(), String> {
  let path = config_path(&app)?;
  let raw =
    serde_json::to_string_pretty(&config).map_err(|e| format!("serialize chat config: {e}"))?;
  fs::write(&path, raw).map_err(|e| format!("write chat config: {e}"))?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn dto_roundtrip_camel_case() {
    let raw = r#"{"baseUrl":"http://localhost:1234/v1","model":"local","apiKey":"sk"}"#;
    let cfg: ChatConfigDto = serde_json::from_str(raw).unwrap();
    assert_eq!(cfg.base_url, "http://localhost:1234/v1");
    assert_eq!(cfg.model, "local");
    assert_eq!(cfg.api_key, "sk");
    let out = serde_json::to_string(&cfg).unwrap();
    assert!(out.contains("baseUrl"));
    assert!(out.contains("apiKey"));
  }
}
