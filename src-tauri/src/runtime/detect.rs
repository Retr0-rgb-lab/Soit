//! Runtime registry detect (PATH / overrides). No process spawn beyond optional future version probes.

use super::prefs::RuntimePreferences;
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
  pub id: String,
  pub name: String,
  pub kind: String,
  pub available: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub version: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub detail: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub bin: Option<String>,
}

/// Known CLI runtimes (detect-only in P0).
const KNOWN_CLI: &[(&str, &str, &str)] = &[
  ("opencode", "OpenCode", "opencode"),
  ("claude-code", "Claude Code", "claude"),
  ("codex", "Codex", "codex"),
  ("kimi", "Kimi", "kimi"),
  ("goose", "Goose", "goose"),
];

/// Safe PATH lookup: split PATH, check candidate names, no shell.
pub fn find_on_path(bin_name: &str) -> Option<PathBuf> {
  let path_var = std::env::var_os("PATH")?;
  let exts: Vec<String> = if cfg!(windows) {
    std::env::var_os("PATHEXT")
      .map(|v| {
        v.to_string_lossy()
          .split(';')
          .filter(|s| !s.is_empty())
          .map(|s| s.to_string())
          .collect()
      })
      .unwrap_or_else(|| {
        vec![
          ".EXE".into(),
          ".CMD".into(),
          ".BAT".into(),
          ".COM".into(),
        ]
      })
  } else {
    vec![String::new()]
  };

  for dir in std::env::split_paths(&path_var) {
    if let Some(found) = candidate_in_dir(&dir, bin_name, &exts) {
      return Some(found);
    }
  }
  None
}

fn candidate_in_dir(dir: &Path, bin_name: &str, exts: &[String]) -> Option<PathBuf> {
  // Exact name first (Unix; Windows may still resolve without ext via PATHEXT).
  let direct = dir.join(bin_name);
  if is_executable_file(&direct) {
    return Some(direct);
  }
  if cfg!(windows) {
    let has_ext = Path::new(bin_name)
      .extension()
      .map(|e| !e.is_empty())
      .unwrap_or(false);
    if !has_ext {
      for ext in exts {
        let p = dir.join(format!("{bin_name}{ext}"));
        if is_executable_file(&p) {
          return Some(p);
        }
        let p2 = dir.join(format!("{bin_name}{}", ext.to_ascii_lowercase()));
        if p2 != p && is_executable_file(&p2) {
          return Some(p2);
        }
      }
    }
  }
  None
}

fn is_executable_file(p: &Path) -> bool {
  match std::fs::metadata(p) {
    Ok(m) => m.is_file(),
    Err(_) => false,
  }
}

fn resolve_bin(bin_name: &str, override_path: Option<&str>) -> (bool, Option<String>, Option<String>) {
  if let Some(raw) = override_path.map(str::trim).filter(|s| !s.is_empty()) {
    let p = Path::new(raw);
    if !p.is_absolute() {
      return (
        false,
        None,
        Some("bin override must be an absolute path".into()),
      );
    }
    match dunce::canonicalize(p) {
      Ok(c) if c.is_file() => {
        return (true, Some(c.to_string_lossy().to_string()), None);
      }
      Ok(_) => {
        return (
          false,
          Some(p.to_string_lossy().to_string()),
          Some("bin override is not a file".into()),
        );
      }
      Err(_) => {
        return (
          false,
          Some(raw.to_string()),
          Some("bin override not found".into()),
        );
      }
    }
  }
  match find_on_path(bin_name) {
    Some(p) => (true, Some(p.to_string_lossy().to_string()), None),
    None => (false, None, Some("not found on PATH".into())),
  }
}

/// Build runtime list from prefs (mock always available).
pub fn list_runtimes_with_prefs(prefs: &RuntimePreferences) -> Vec<RuntimeInfo> {
  let mut out = Vec::with_capacity(1 + KNOWN_CLI.len());
  out.push(RuntimeInfo {
    id: "mock".into(),
    name: "Mock".into(),
    kind: "mock".into(),
    available: true,
    version: None,
    detail: Some("built-in; no process spawn".into()),
    bin: None,
  });

  for (id, name, bin_name) in KNOWN_CLI {
    let ov = prefs.bin_overrides.get(*id).map(String::as_str);
    let (available, bin, detail) = resolve_bin(bin_name, ov);
    out.push(RuntimeInfo {
      id: (*id).into(),
      name: (*name).into(),
      kind: "cli".into(),
      available,
      version: None,
      detail,
      bin,
    });
  }
  out
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::collections::HashMap;

  #[test]
  fn list_always_includes_mock_available() {
    let prefs = RuntimePreferences::default();
    let list = list_runtimes_with_prefs(&prefs);
    let mock = list.iter().find(|r| r.id == "mock").expect("mock");
    assert!(mock.available);
    assert_eq!(mock.kind, "mock");
    assert!(list.iter().any(|r| r.id == "opencode"));
    assert!(list.iter().any(|r| r.id == "claude-code"));
  }

  #[test]
  fn relative_override_not_available() {
    let mut prefs = RuntimePreferences::default();
    prefs
      .bin_overrides
      .insert("opencode".into(), "relative/bin".into());
    let list = list_runtimes_with_prefs(&prefs);
    let oc = list.iter().find(|r| r.id == "opencode").unwrap();
    assert!(!oc.available);
    assert!(
      oc.detail
        .as_deref()
        .unwrap_or("")
        .contains("absolute"),
      "{:?}",
      oc.detail
    );
  }

  #[test]
  fn camel_case_runtime_info() {
    let info = RuntimeInfo {
      id: "mock".into(),
      name: "Mock".into(),
      kind: "mock".into(),
      available: true,
      version: Some("1".into()),
      detail: None,
      bin: None,
    };
    let json = serde_json::to_string(&info).unwrap();
    assert!(json.contains("\"id\""));
    assert!(!json.contains("bin")); // skipped when None
  }

  #[test]
  fn empty_overrides_map_ok() {
    let prefs = RuntimePreferences {
      default_runtime_id: "mock".into(),
      bin_overrides: HashMap::new(),
      enable_spawn: false,
    };
    let list = list_runtimes_with_prefs(&prefs);
    assert_eq!(list[0].id, "mock");
  }
}
