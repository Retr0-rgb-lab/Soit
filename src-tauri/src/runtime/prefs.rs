//! Runtime preferences in app config dir (not universe.db).
//! Path: `{app_config_dir}/soit-runtime.json`

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePreferences {
  #[serde(default = "default_runtime_id")]
  pub default_runtime_id: String,
  #[serde(default)]
  pub bin_overrides: HashMap<String, String>,
  /// Allow real process spawn (desktop only). Default false.
  #[serde(default)]
  pub enable_spawn: bool,
}

fn default_runtime_id() -> String {
  "mock".into()
}

impl Default for RuntimePreferences {
  fn default() -> Self {
    Self {
      default_runtime_id: default_runtime_id(),
      bin_overrides: HashMap::new(),
      enable_spawn: false,
    }
  }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_config_dir()
    .map_err(|e| format!("app_config_dir: {e}"))?;
  fs::create_dir_all(&dir).map_err(|e| format!("create config dir: {e}"))?;
  Ok(dir.join("soit-runtime.json"))
}

fn normalize(mut prefs: RuntimePreferences) -> RuntimePreferences {
  if prefs.default_runtime_id.trim().is_empty() {
    prefs.default_runtime_id = default_runtime_id();
  }
  prefs
}

/// Read prefs from disk; missing/invalid file → defaults (`enableSpawn: false`).
pub fn read_prefs(app: &AppHandle) -> RuntimePreferences {
  let Ok(path) = config_path(app) else {
    return RuntimePreferences::default();
  };
  if !path.exists() {
    return RuntimePreferences::default();
  }
  let Ok(raw) = fs::read_to_string(&path) else {
    return RuntimePreferences::default();
  };
  match serde_json::from_str::<RuntimePreferences>(&raw) {
    Ok(p) => normalize(p),
    Err(_) => RuntimePreferences::default(),
  }
}

fn write_prefs_file(app: &AppHandle, prefs: &RuntimePreferences) -> Result<(), String> {
  let path = config_path(app)?;
  let raw =
    serde_json::to_string_pretty(prefs).map_err(|e| format!("serialize runtime prefs: {e}"))?;
  fs::write(&path, raw).map_err(|e| format!("write runtime prefs: {e}"))?;
  Ok(())
}

pub fn get_runtime_prefs(app: &AppHandle) -> Result<RuntimePreferences, String> {
  Ok(read_prefs(app))
}

pub fn set_runtime_prefs(
  app: &AppHandle,
  prefs: RuntimePreferences,
) -> Result<RuntimePreferences, String> {
  let prefs = normalize(prefs);
  write_prefs_file(app, &prefs)?;
  Ok(prefs)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn defaults_enable_spawn_false_and_mock() {
    let p = RuntimePreferences::default();
    assert!(!p.enable_spawn);
    assert_eq!(p.default_runtime_id, "mock");
    assert!(p.bin_overrides.is_empty());
  }

  #[test]
  fn dto_roundtrip_camel_case() {
    let raw = r#"{"defaultRuntimeId":"opencode","binOverrides":{"opencode":"C:\\bin\\opencode.exe"},"enableSpawn":true}"#;
    let p: RuntimePreferences = serde_json::from_str(raw).unwrap();
    assert_eq!(p.default_runtime_id, "opencode");
    assert!(p.enable_spawn);
    assert_eq!(
      p.bin_overrides.get("opencode").map(String::as_str),
      Some("C:\\bin\\opencode.exe")
    );
    let out = serde_json::to_string(&p).unwrap();
    assert!(out.contains("defaultRuntimeId"));
    assert!(out.contains("binOverrides"));
    assert!(out.contains("enableSpawn"));
  }

  #[test]
  fn missing_fields_default_safe() {
    let p: RuntimePreferences = serde_json::from_str("{}").unwrap();
    assert_eq!(p.default_runtime_id, "mock");
    assert!(!p.enable_spawn);
  }
}
