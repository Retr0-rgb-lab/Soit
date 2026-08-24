//! Session preferences in app config dir (not universe.db).
//! Path: `{app_config_dir}/soit-session.json`
//! Fields: version, lastVault, recentVaults (newest first, ≤8).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const MAX_RECENT_VAULTS: usize = 8;
pub const SESSION_CONFIG_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigDto {
  #[serde(default = "default_version")]
  pub version: u32,
  #[serde(default)]
  pub last_vault: Option<String>,
  #[serde(default)]
  pub recent_vaults: Vec<String>,
}

fn default_version() -> u32 {
  SESSION_CONFIG_VERSION
}

impl Default for SessionConfigDto {
  fn default() -> Self {
    Self {
      version: SESSION_CONFIG_VERSION,
      last_vault: None,
      recent_vaults: vec![],
    }
  }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_config_dir()
    .map_err(|e| format!("app_config_dir: {e}"))?;
  fs::create_dir_all(&dir).map_err(|e| format!("create config dir: {e}"))?;
  Ok(dir.join("soit-session.json"))
}

/// Trim, drop empties, dedupe (first wins), cap at MAX_RECENT_VAULTS.
pub fn normalize_recent_vaults(paths: &[String]) -> Vec<String> {
  let mut out = Vec::new();
  let mut seen = std::collections::HashSet::new();
  for p in paths {
    let t = p.trim();
    if t.is_empty() || seen.contains(t) {
      continue;
    }
    seen.insert(t.to_string());
    out.push(t.to_string());
    if out.len() >= MAX_RECENT_VAULTS {
      break;
    }
  }
  out
}

pub fn normalize_session(mut cfg: SessionConfigDto) -> SessionConfigDto {
  cfg.version = SESSION_CONFIG_VERSION;
  cfg.last_vault = cfg
    .last_vault
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string());
  cfg.recent_vaults = normalize_recent_vaults(&cfg.recent_vaults);
  cfg
}

/// Migrate raw JSON → SessionConfigDto v1.
/// Missing version / only lastVault → seed recentVaults from lastVault.
pub fn migrate_session_value(raw: &Value) -> SessionConfigDto {
  let obj = match raw.as_object() {
    Some(o) => o,
    None => return SessionConfigDto::default(),
  };

  let last_vault = obj
    .get("lastVault")
    .and_then(|v| {
      if v.is_null() {
        return Some(None);
      }
      v.as_str().map(|s| {
        let t = s.trim();
        if t.is_empty() {
          None
        } else {
          Some(t.to_string())
        }
      })
    })
    .unwrap_or(None);

  let has_version = obj
    .get("version")
    .and_then(|v| v.as_u64())
    .map(|n| n == SESSION_CONFIG_VERSION as u64)
    .unwrap_or(false);
  let has_recents_key = obj.contains_key("recentVaults");

  let recent_vaults = if has_recents_key || has_version {
    obj
      .get("recentVaults")
      .and_then(|v| v.as_array())
      .map(|arr| {
        arr
          .iter()
          .filter_map(|x| x.as_str().map(|s| s.to_string()))
          .collect::<Vec<_>>()
      })
      .unwrap_or_default()
  } else {
    // Legacy `{ lastVault }` only
    match &last_vault {
      Some(p) => vec![p.clone()],
      None => vec![],
    }
  };

  normalize_session(SessionConfigDto {
    version: SESSION_CONFIG_VERSION,
    last_vault,
    recent_vaults,
  })
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
  match serde_json::from_str::<Value>(&raw) {
    Ok(v) => migrate_session_value(&v),
    Err(_) => SessionConfigDto::default(),
  }
}

fn write_session(app: &AppHandle, cfg: &SessionConfigDto) -> Result<(), String> {
  let path = config_path(app)?;
  let normalized = normalize_session(cfg.clone());
  let raw = serde_json::to_string_pretty(&normalized)
    .map_err(|e| format!("serialize session config: {e}"))?;
  fs::write(&path, raw).map_err(|e| format!("write session config: {e}"))?;
  Ok(())
}

/// Push path to front of recentVaults (dedupe, cap 8). Does not set lastVault.
pub fn push_recent(cfg: &mut SessionConfigDto, path: &str) {
  let t = path.trim();
  if t.is_empty() {
    return;
  }
  cfg.recent_vaults.retain(|p| p != t);
  cfg.recent_vaults.insert(0, t.to_string());
  if cfg.recent_vaults.len() > MAX_RECENT_VAULTS {
    cfg.recent_vaults.truncate(MAX_RECENT_VAULTS);
  }
  cfg.version = SESSION_CONFIG_VERSION;
}

/// Remove path from recents; clear lastVault if it matches.
/// (FE forget uses set_session_config; kept for parity / tests.)
#[allow(dead_code)]
pub fn remove_recent(cfg: &mut SessionConfigDto, path: &str) {
  let t = path.trim();
  if t.is_empty() {
    return;
  }
  cfg.recent_vaults.retain(|p| p != t);
  if cfg
    .last_vault
    .as_deref()
    .map(|s| s.trim() == t)
    .unwrap_or(false)
  {
    cfg.last_vault = None;
  }
  cfg.version = SESSION_CONFIG_VERSION;
}

/// Read lastVault without opening DB (bootstrap-safe).
pub fn read_last_vault(app: &AppHandle) -> Option<String> {
  read_session(app).last_vault
}

/// Persist lastVault after successful open.
/// `Some(p)` → last=p + push_recent(p); `None` → **only** last=null (recents unchanged).
pub fn write_last_vault(app: &AppHandle, path: Option<&str>) -> Result<(), String> {
  let mut cfg = read_session(app);
  match path.map(str::trim).filter(|s| !s.is_empty()) {
    Some(p) => {
      cfg.last_vault = Some(p.to_string());
      push_recent(&mut cfg, p);
    }
    None => {
      cfg.last_vault = None;
      // recents unchanged
    }
  }
  write_session(app, &cfg)
}

#[tauri::command]
pub fn get_session_config(app: AppHandle) -> Result<SessionConfigDto, String> {
  Ok(read_session(&app))
}

#[tauri::command]
pub fn set_session_config(app: AppHandle, config: SessionConfigDto) -> Result<(), String> {
  write_session(&app, &normalize_session(config))
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
  use serde_json::json;

  #[test]
  fn dto_roundtrip_camel_case() {
    let raw = r#"{"version":1,"lastVault":"E:\\vaults\\demo","recentVaults":["E:\\vaults\\demo"]}"#;
    let cfg: SessionConfigDto = serde_json::from_str(raw).unwrap();
    assert_eq!(cfg.last_vault.as_deref(), Some("E:\\vaults\\demo"));
    assert_eq!(cfg.recent_vaults, vec!["E:\\vaults\\demo".to_string()]);
    let out = serde_json::to_string(&cfg).unwrap();
    assert!(out.contains("lastVault"));
    assert!(out.contains("recentVaults"));
  }

  #[test]
  fn dto_null_and_missing() {
    let cfg: SessionConfigDto = serde_json::from_str(r#"{"lastVault":null}"#).unwrap();
    assert!(cfg.last_vault.is_none());
    let empty: SessionConfigDto = serde_json::from_str("{}").unwrap();
    assert!(empty.last_vault.is_none());
    assert!(empty.recent_vaults.is_empty());
  }

  #[test]
  fn migrate_legacy_last_vault_only() {
    let cfg = migrate_session_value(&json!({"lastVault":"E:\\vaults\\a"}));
    assert_eq!(cfg.version, 1);
    assert_eq!(cfg.last_vault.as_deref(), Some("E:\\vaults\\a"));
    assert_eq!(cfg.recent_vaults, vec!["E:\\vaults\\a".to_string()]);
  }

  #[test]
  fn migrate_legacy_null_last() {
    let cfg = migrate_session_value(&json!({"lastVault":null}));
    assert!(cfg.last_vault.is_none());
    assert!(cfg.recent_vaults.is_empty());
  }

  #[test]
  fn migrate_v1_preserves_recents_without_reseeding() {
    let cfg = migrate_session_value(&json!({
      "version": 1,
      "lastVault": "A",
      "recentVaults": ["B", "C"]
    }));
    assert_eq!(cfg.last_vault.as_deref(), Some("A"));
    assert_eq!(
      cfg.recent_vaults,
      vec!["B".to_string(), "C".to_string()]
    );
  }

  #[test]
  fn push_recent_newest_first_dedupe_cap() {
    let mut cfg = SessionConfigDto::default();
    for i in 0..10 {
      push_recent(&mut cfg, &format!("V:\\{i}"));
    }
    assert_eq!(cfg.recent_vaults.len(), MAX_RECENT_VAULTS);
    assert_eq!(cfg.recent_vaults[0], "V:\\9");
    assert_eq!(cfg.recent_vaults[7], "V:\\2");
    push_recent(&mut cfg, "V:\\5");
    assert_eq!(cfg.recent_vaults[0], "V:\\5");
    assert_eq!(cfg.recent_vaults.iter().filter(|p| *p == "V:\\5").count(), 1);
  }

  #[test]
  fn clear_last_does_not_wipe_recents_via_normalize() {
    let cfg = normalize_session(SessionConfigDto {
      version: 1,
      last_vault: None,
      recent_vaults: vec!["A".into(), "B".into()],
    });
    assert!(cfg.last_vault.is_none());
    assert_eq!(cfg.recent_vaults, vec!["A".to_string(), "B".to_string()]);
  }

  #[test]
  fn remove_recent_clears_last_when_match() {
    let mut cfg = SessionConfigDto {
      version: 1,
      last_vault: Some("A".into()),
      recent_vaults: vec!["A".into(), "B".into()],
    };
    remove_recent(&mut cfg, "A");
    assert!(cfg.last_vault.is_none());
    assert_eq!(cfg.recent_vaults, vec!["B".to_string()]);
  }

  #[test]
  fn normalize_dedupes_and_caps() {
    let paths: Vec<String> = (0..12).map(|i| format!("P:\\v{i}")).collect();
    let out = normalize_recent_vaults(&paths);
    assert_eq!(out.len(), 8);
    assert_eq!(out[0], "P:\\v0");
  }
}
