//! BYOK model settings on disk (not universe.db).
//! Path: `{app_config_dir}/soit-chat.json`
//!
//! File may hold ModelSettings v1 or legacy flat ChatConfigDto.
//! `get_chat_config` always projects the active model to ChatConfigDto.

use serde::{Deserialize, Serialize};
use serde_json::Value;
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDto {
  pub id: String,
  pub name: String,
  pub base_url: String,
  pub api_key: String,
  pub created_at: i64,
  pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelEntryDto {
  pub id: String,
  pub provider_id: String,
  pub model_id: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub label: Option<String>,
  #[serde(default = "default_true")]
  pub enabled: bool,
  pub created_at: i64,
  pub updated_at: i64,
}

fn default_true() -> bool {
  true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSettingsDto {
  pub version: u32,
  #[serde(default)]
  pub providers: Vec<ProviderDto>,
  #[serde(default)]
  pub models: Vec<ModelEntryDto>,
  #[serde(default)]
  pub active_model_id: Option<String>,
}

impl Default for ModelSettingsDto {
  fn default() -> Self {
    Self {
      version: 1,
      providers: vec![],
      models: vec![],
      active_model_id: None,
    }
  }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_config_dir()
    .map_err(|e| format!("app_config_dir: {e}"))?;
  fs::create_dir_all(&dir).map_err(|e| format!("create config dir: {e}"))?;
  Ok(dir.join("soit-chat.json"))
}

fn default_chat_config() -> ChatConfigDto {
  ChatConfigDto {
    base_url: "https://api.openai.com/v1".into(),
    model: "gpt-4o-mini".into(),
    api_key: String::new(),
  }
}

fn now_ms() -> i64 {
  use std::time::{SystemTime, UNIX_EPOCH};
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as i64)
    .unwrap_or(0)
}

fn short_id(prefix: &str) -> String {
  format!("{prefix}_{}", now_ms())
}

fn provider_name_from_base_url(base_url: &str) -> String {
  let trimmed = base_url.trim();
  if trimmed.is_empty() {
    return "默认供应商".into();
  }
  // naive host extract without full URL parse dependency edge cases
  let without_scheme = trimmed
    .strip_prefix("https://")
    .or_else(|| trimmed.strip_prefix("http://"))
    .unwrap_or(trimmed);
  let host = without_scheme
    .split('/')
    .next()
    .unwrap_or("")
    .split(':')
    .next()
    .unwrap_or("")
    .trim();
  if host.is_empty() {
    return "默认供应商".into();
  }
  let host = host.strip_prefix("www.").unwrap_or(host);
  let parts: Vec<&str> = host.split('.').collect();
  let core = if parts.len() >= 2 && parts[0] == "api" {
    parts[1]
  } else {
    parts[0]
  };
  if core.is_empty() {
    return host.to_string();
  }
  let mut chars = core.chars();
  match chars.next() {
    Some(c) => format!("{}{}", c.to_uppercase(), chars.as_str()),
    None => "默认供应商".into(),
  }
}

/// Migrate flat ChatConfig → ModelSettings (empty key → empty catalog).
pub fn migrate_chat_config_to_settings(cfg: &ChatConfigDto) -> ModelSettingsDto {
  let api_key = cfg.api_key.trim();
  if api_key.is_empty() {
    return ModelSettingsDto::default();
  }
  let t = now_ms();
  let provider_id = short_id("p");
  let model_entry_id = short_id("m");
  let base_url = if cfg.base_url.trim().is_empty() {
    default_chat_config().base_url
  } else {
    cfg.base_url.trim().to_string()
  };
  let model_id = if cfg.model.trim().is_empty() {
    default_chat_config().model
  } else {
    cfg.model.trim().to_string()
  };
  ModelSettingsDto {
    version: 1,
    providers: vec![ProviderDto {
      id: provider_id.clone(),
      name: provider_name_from_base_url(&base_url),
      base_url,
      api_key: api_key.to_string(),
      created_at: t,
      updated_at: t,
    }],
    models: vec![ModelEntryDto {
      id: model_entry_id.clone(),
      provider_id,
      model_id,
      label: None,
      enabled: true,
      created_at: t,
      updated_at: t,
    }],
    active_model_id: Some(model_entry_id),
  }
}

/// Normalize / validate settings: drop orphan models; clear invalid active.
pub fn normalize_model_settings(mut s: ModelSettingsDto) -> ModelSettingsDto {
  s.version = 1;
  let provider_ids: std::collections::HashSet<String> =
    s.providers.iter().map(|p| p.id.clone()).collect();
  s.models
    .retain(|m| !m.id.is_empty() && !m.provider_id.is_empty() && !m.model_id.is_empty() && provider_ids.contains(&m.provider_id));
  if let Some(ref aid) = s.active_model_id {
    let ok = s
      .models
      .iter()
      .any(|m| m.id == *aid && m.enabled);
    if !ok {
      s.active_model_id = None;
    }
  }
  s
}

/// Project active model → ChatConfigDto (empty key when no active).
pub fn resolve_chat_config(settings: &ModelSettingsDto) -> ChatConfigDto {
  let s = normalize_model_settings(settings.clone());
  let Some(ref aid) = s.active_model_id else {
    return default_chat_config();
  };
  let Some(entry) = s.models.iter().find(|m| m.id == *aid && m.enabled) else {
    return default_chat_config();
  };
  let Some(provider) = s.providers.iter().find(|p| p.id == entry.provider_id) else {
    return default_chat_config();
  };
  let mut cfg = ChatConfigDto {
    base_url: provider.base_url.clone(),
    model: entry.model_id.clone(),
    api_key: provider.api_key.clone(),
  };
  if cfg.base_url.trim().is_empty() {
    cfg.base_url = default_chat_config().base_url;
  }
  if cfg.model.trim().is_empty() {
    cfg.model = default_chat_config().model;
  }
  cfg
}

/// Parse disk JSON: versioned settings, or legacy flat ChatConfig.
pub fn parse_disk_value(raw: &str) -> Result<ModelSettingsDto, String> {
  let value: Value =
    serde_json::from_str(raw).map_err(|e| format!("parse chat config: {e}"))?;
  parse_disk_json(value)
}

pub fn parse_disk_json(value: Value) -> Result<ModelSettingsDto, String> {
  if value.get("version").is_some() || value.get("providers").is_some() {
    let s: ModelSettingsDto = serde_json::from_value(value)
      .map_err(|e| format!("parse model settings: {e}"))?;
    return Ok(normalize_model_settings(s));
  }
  // Legacy flat ChatConfig
  let cfg: ChatConfigDto =
    serde_json::from_value(value).map_err(|e| format!("parse chat config: {e}"))?;
  Ok(normalize_model_settings(migrate_chat_config_to_settings(&cfg)))
}

fn read_settings_from_path(path: &std::path::Path) -> Result<ModelSettingsDto, String> {
  if !path.exists() {
    return Ok(ModelSettingsDto::default());
  }
  let raw = fs::read_to_string(path).map_err(|e| format!("read chat config: {e}"))?;
  if raw.trim().is_empty() {
    return Ok(ModelSettingsDto::default());
  }
  parse_disk_value(&raw)
}

fn write_settings_to_path(path: &std::path::Path, settings: &ModelSettingsDto) -> Result<(), String> {
  let s = normalize_model_settings(settings.clone());
  let raw =
    serde_json::to_string_pretty(&s).map_err(|e| format!("serialize model settings: {e}"))?;
  fs::write(path, raw).map_err(|e| format!("write chat config: {e}"))
}

/// Legacy set_chat_config: upsert single provider+model or clear active.
pub fn upsert_from_chat_config(
  settings: &ModelSettingsDto,
  cfg: &ChatConfigDto,
) -> ModelSettingsDto {
  let mut s = normalize_model_settings(settings.clone());
  let api_key = cfg.api_key.trim();
  if api_key.is_empty() {
    s.active_model_id = None;
    return s;
  }
  if s.providers.is_empty() {
    return migrate_chat_config_to_settings(cfg);
  }
  let t = now_ms();
  let base_url = if cfg.base_url.trim().is_empty() {
    default_chat_config().base_url
  } else {
    cfg.base_url.trim().to_string()
  };
  let model_id = if cfg.model.trim().is_empty() {
    default_chat_config().model
  } else {
    cfg.model.trim().to_string()
  };

  // Prefer active model's provider; else first
  let provider_idx = s
    .active_model_id
    .as_ref()
    .and_then(|aid| s.models.iter().find(|m| m.id == *aid))
    .and_then(|m| s.providers.iter().position(|p| p.id == m.provider_id))
    .unwrap_or(0);

  s.providers[provider_idx].base_url = base_url;
  s.providers[provider_idx].api_key = api_key.to_string();
  s.providers[provider_idx].updated_at = t;
  let provider_id = s.providers[provider_idx].id.clone();

  let under: Vec<usize> = s
    .models
    .iter()
    .enumerate()
    .filter(|(_, m)| m.provider_id == provider_id)
    .map(|(i, _)| i)
    .collect();

  let match_idx = under
    .iter()
    .copied()
    .find(|&i| s.models[i].model_id == model_id)
    .or_else(|| {
      s.active_model_id.as_ref().and_then(|aid| {
        under
          .iter()
          .copied()
          .find(|&i| s.models[i].id == *aid)
      })
    })
    .or_else(|| under.first().copied());

  if let Some(i) = match_idx {
    s.models[i].model_id = model_id;
    s.models[i].enabled = true;
    s.models[i].updated_at = t;
    s.active_model_id = Some(s.models[i].id.clone());
  } else {
    let id = short_id("m");
    s.models.push(ModelEntryDto {
      id: id.clone(),
      provider_id,
      model_id,
      label: None,
      enabled: true,
      created_at: t,
      updated_at: t,
    });
    s.active_model_id = Some(id);
  }
  normalize_model_settings(s)
}

#[tauri::command]
pub fn get_model_settings(app: AppHandle) -> Result<ModelSettingsDto, String> {
  let path = config_path(&app)?;
  read_settings_from_path(&path)
}

#[tauri::command]
pub fn set_model_settings(app: AppHandle, settings: ModelSettingsDto) -> Result<(), String> {
  let path = config_path(&app)?;
  write_settings_to_path(&path, &settings)
}

#[tauri::command]
pub fn get_chat_config(app: AppHandle) -> Result<ChatConfigDto, String> {
  let path = config_path(&app)?;
  let settings = read_settings_from_path(&path)?;
  Ok(resolve_chat_config(&settings))
}

#[tauri::command]
pub fn set_chat_config(app: AppHandle, config: ChatConfigDto) -> Result<(), String> {
  let path = config_path(&app)?;
  let current = read_settings_from_path(&path)?;
  let next = upsert_from_chat_config(&current, &config);
  write_settings_to_path(&path, &next)
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

  #[test]
  fn migrate_empty_key_is_empty_settings() {
    let s = migrate_chat_config_to_settings(&ChatConfigDto {
      base_url: "https://api.openai.com/v1".into(),
      model: "gpt-4o-mini".into(),
      api_key: "".into(),
    });
    assert!(s.providers.is_empty());
    assert!(s.models.is_empty());
    assert!(s.active_model_id.is_none());
  }

  #[test]
  fn migrate_with_key_and_resolve() {
    let s = migrate_chat_config_to_settings(&ChatConfigDto {
      base_url: "https://api.deepseek.com/v1".into(),
      model: "deepseek-chat".into(),
      api_key: "sk-test".into(),
    });
    assert_eq!(s.providers.len(), 1);
    assert_eq!(s.models.len(), 1);
    assert_eq!(s.active_model_id.as_deref(), Some(s.models[0].id.as_str()));
    let cfg = resolve_chat_config(&s);
    assert_eq!(cfg.api_key, "sk-test");
    assert_eq!(cfg.model, "deepseek-chat");
    assert_eq!(cfg.base_url, "https://api.deepseek.com/v1");
  }

  #[test]
  fn parse_legacy_flat_json() {
    let raw = r#"{"baseUrl":"http://localhost:1234/v1","model":"local","apiKey":"sk"}"#;
    let s = parse_disk_value(raw).unwrap();
    assert_eq!(s.version, 1);
    assert_eq!(s.providers.len(), 1);
    let cfg = resolve_chat_config(&s);
    assert_eq!(cfg.model, "local");
    assert_eq!(cfg.api_key, "sk");
  }

  #[test]
  fn parse_versioned_settings() {
    let raw = r#"{
      "version": 1,
      "providers": [{
        "id": "p1",
        "name": "OpenAI",
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "k",
        "createdAt": 1,
        "updatedAt": 1
      }],
      "models": [{
        "id": "m1",
        "providerId": "p1",
        "modelId": "gpt-4o",
        "enabled": true,
        "createdAt": 1,
        "updatedAt": 1
      }],
      "activeModelId": "m1"
    }"#;
    let s = parse_disk_value(raw).unwrap();
    assert_eq!(s.active_model_id.as_deref(), Some("m1"));
    assert_eq!(resolve_chat_config(&s).model, "gpt-4o");
  }

  #[test]
  fn clear_active_on_empty_key_upsert() {
    let s = migrate_chat_config_to_settings(&ChatConfigDto {
      base_url: "https://api.openai.com/v1".into(),
      model: "gpt-4o".into(),
      api_key: "sk".into(),
    });
    let next = upsert_from_chat_config(
      &s,
      &ChatConfigDto {
        base_url: "https://api.openai.com/v1".into(),
        model: "gpt-4o".into(),
        api_key: "".into(),
      },
    );
    assert_eq!(next.providers.len(), 1);
    assert!(next.active_model_id.is_none());
    assert!(resolve_chat_config(&next).api_key.is_empty());
  }

  #[test]
  fn settings_serialize_camel_case() {
    let s = migrate_chat_config_to_settings(&ChatConfigDto {
      base_url: "https://api.openai.com/v1".into(),
      model: "gpt-4o-mini".into(),
      api_key: "sk".into(),
    });
    let out = serde_json::to_string(&s).unwrap();
    assert!(out.contains("baseUrl"));
    assert!(out.contains("apiKey"));
    assert!(out.contains("activeModelId"));
    assert!(out.contains("providerId"));
    assert!(out.contains("modelId"));
    assert!(out.contains("createdAt"));
  }
}
