//! Session preferences in app config dir (not universe.db).
//! Path: `{app_config_dir}/soit-session.json`
//! Fields: lastVault — path remembered after successful open_universe.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigDto {
  #[serde(default)]
  pub last_vault: Option<String>,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_config_dir()
    .map_err(|e| format!("app_config_dir: {e}"))?;
  fs::create_dir_all(&dir).map_err(|e| format!("create config dir: {e}"))?;
  Ok(dir.join("soit-session.json"))
}

fn read_session(app: &AppHandle) -> SessionConfigDto {
  let Ok(path) = config_path(app) else {
    return SessionConfigDto::default();
  };
  if !path.exists() {
    return SessionConfigDto::default();
  }
  let Ok(raw) = fs::read_to_string(&path) else {
    return SessionConfigDto::default();
  };
  serde_json::from_str(&raw).unwrap_or_default()
}

fn write_session(app: &AppHandle, cfg: &SessionConfigDto) -> Result<(), String> {
  let path = config_path(app)?;
  let raw =
    serde_json::to_string_pretty(cfg).map_err(|e| format!("serialize session config: {e}"))?;
  fs::write(&path, raw).map_err(|e| format!("write session config: {e}"))?;
  Ok(())
}

/// Read lastVault without opening DB (bootstrap-safe).
pub fn read_last_vault(app: &AppHandle) -> Option<String> {
  read_session(app)
    .last_vault
    .and_then(|s| {
      let t = s.trim().to_string();
      if t.is_empty() {
        None
      } else {
        Some(t)
      }
    })
}

/// Persist lastVault after successful open. `None` clears the field.
pub fn write_last_vault(app: &AppHandle, path: Option<&str>) -> Result<(), String> {
  let mut cfg = read_session(app);
  cfg.last_vault = path
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string());
  write_session(app, &cfg)
}

#[tauri::command]
pub fn get_last_vault(app: AppHandle) -> Result<Option<String>, String> {
  Ok(read_last_vault(&app))
}

#[tauri::command]
pub fn set_last_vault(app: AppHandle, path: Option<String>) -> Result<(), String> {
  write_last_vault(&app, path.as_deref())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn dto_roundtrip_camel_case() {
    let raw = r#"{"lastVault":"E:\\vaults\\demo"}"#;
    let cfg: SessionConfigDto = serde_json::from_str(raw).unwrap();
    assert_eq!(cfg.last_vault.as_deref(), Some("E:\\vaults\\demo"));
    let out = serde_json::to_string(&cfg).unwrap();
    assert!(out.contains("lastVault"));
  }

  #[test]
  fn dto_null_and_missing() {
    let cfg: SessionConfigDto = serde_json::from_str(r#"{"lastVault":null}"#).unwrap();
    assert!(cfg.last_vault.is_none());
    let empty: SessionConfigDto = serde_json::from_str("{}").unwrap();
    assert!(empty.last_vault.is_none());
  }
}
