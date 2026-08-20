//! Runtime handoff: mock P0 path; CLI rejected unless enableSpawn (still not implemented).

use super::prefs::RuntimePreferences;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

/// In-flight handoff control (at most one run).
#[derive(Default)]
pub struct HandoffControl {
  pub cancel: AtomicBool,
  pub active_run_id: Mutex<Option<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartHandoffArgs {
  pub card_id: String,
  pub runtime_id: String,
  #[serde(default)]
  pub brief_markdown: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffResult {
  pub run_id: String,
  pub status: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub text: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelHandoffResult {
  pub ok: bool,
}

/// Reject run_id with `..` or path separators; build `vault/.soit/runs/<run_id>/`.
pub fn runs_dir(vault: &Path, run_id: &str) -> Result<PathBuf, String> {
  validate_run_id(run_id)?;
  let base = vault.join(".soit").join("runs");
  let candidate = base.join(run_id);
  // Ensure candidate stays under base even before create (lexical + after canonicalize).
  let base_canon = match dunce::canonicalize(&base) {
    Ok(p) => p,
    Err(_) => {
      // Parent may not exist yet — create runs root then canonicalize.
      std::fs::create_dir_all(&base).map_err(|e| format!("create runs dir: {e}"))?;
      dunce::canonicalize(&base).map_err(|e| format!("canonicalize runs dir: {e}"))?
    }
  };
  std::fs::create_dir_all(&candidate).map_err(|e| format!("create run dir: {e}"))?;
  let cand_canon =
    dunce::canonicalize(&candidate).map_err(|e| format!("canonicalize run dir: {e}"))?;
  if !cand_canon.starts_with(&base_canon) {
    return Err("run path escapes vault/.soit/runs/".into());
  }
  Ok(cand_canon)
}

pub fn validate_run_id(run_id: &str) -> Result<(), String> {
  let id = run_id.trim();
  if id.is_empty() {
    return Err("run_id is empty".into());
  }
  if id.contains("..") {
    return Err("run_id must not contain ..".into());
  }
  if id.contains('/') || id.contains('\\') {
    return Err("run_id must not contain path separators".into());
  }
  // Extra: reject other path-ish chars
  if id.contains('\0') {
    return Err("run_id invalid".into());
  }
  Ok(())
}

fn new_run_id() -> String {
  let ms = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_millis())
    .unwrap_or(0);
  format!("run_{ms}")
}

const MOCK_TEXT: &str = "Mock handoff complete. Reviewed the brief and outlined next steps for [[探究任务]] and [[概念标记]].";

/// Core handoff logic (testable without Tauri AppHandle).
pub fn start_handoff_impl(
  args: &StartHandoffArgs,
  prefs: &RuntimePreferences,
  control: &HandoffControl,
  vault: Option<&Path>,
) -> Result<HandoffResult, String> {
  let runtime_id = args.runtime_id.trim();
  if runtime_id.is_empty() {
    return Err("runtime_id is required".into());
  }

  if let Some(brief) = args.brief_markdown.as_ref() {
    if !brief.is_empty() && args.card_id.trim().is_empty() {
      return Err("card_id is required when brief_markdown is provided".into());
    }
  }

  if runtime_id != "mock" {
    if !prefs.enable_spawn {
      return Err("spawn disabled".into());
    }
    // P0: no CLI adapter
    return Err("cli adapter not implemented".into());
  }

  // Mock does not require enable_spawn or vault.
  let run_id = new_run_id();

  {
    let mut active = control
      .active_run_id
      .lock()
      .map_err(|_| "handoff lock poisoned".to_string())?;
    if active.is_some() {
      return Err("runtime handoff already in progress".into());
    }
    *active = Some(run_id.clone());
    control.cancel.store(false, Ordering::SeqCst);
  }

  let clear = |control: &HandoffControl| {
    if let Ok(mut g) = control.active_run_id.lock() {
      *g = None;
    }
  };

  // Optional: stage brief under runs sandbox when vault bound.
  if let (Some(vault), Some(brief)) = (vault, args.brief_markdown.as_ref()) {
    if !brief.is_empty() {
      match runs_dir(vault, &run_id) {
        Ok(dir) => {
          let brief_path = dir.join("brief.md");
          if let Err(e) = std::fs::write(&brief_path, brief) {
            clear(control);
            return Err(format!("write brief.md: {e}"));
          }
        }
        Err(e) => {
          clear(control);
          return Err(e);
        }
      }
    }
  }

  // ~800ms cancellable wait (chunked).
  let chunks = 16u32;
  let step = Duration::from_millis(50);
  for _ in 0..chunks {
    if control.cancel.load(Ordering::SeqCst) {
      clear(control);
      return Ok(HandoffResult {
        run_id,
        status: "cancelled".into(),
        text: None,
        error: Some("cancelled".into()),
      });
    }
    std::thread::sleep(step);
  }

  if control.cancel.load(Ordering::SeqCst) {
    clear(control);
    return Ok(HandoffResult {
      run_id,
      status: "cancelled".into(),
      text: None,
      error: Some("cancelled".into()),
    });
  }

  clear(control);
  Ok(HandoffResult {
    run_id,
    status: "succeeded".into(),
    text: Some(MOCK_TEXT.into()),
    error: None,
  })
}

pub fn cancel_handoff_impl(control: &HandoffControl) -> CancelHandoffResult {
  control.cancel.store(true, Ordering::SeqCst);
  CancelHandoffResult { ok: true }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::collections::HashMap;

  fn prefs_spawn(enable: bool) -> RuntimePreferences {
    RuntimePreferences {
      default_runtime_id: "mock".into(),
      bin_overrides: HashMap::new(),
      enable_spawn: enable,
    }
  }

  #[test]
  fn validate_run_id_rejects_traversal() {
    assert!(validate_run_id("..").is_err());
    assert!(validate_run_id("../x").is_err());
    assert!(validate_run_id("a/b").is_err());
    assert!(validate_run_id("a\\b").is_err());
    assert!(validate_run_id("ok_run-1").is_ok());
  }

  #[test]
  fn runs_dir_rejects_dotdot_run_id() {
    let dir = std::env::temp_dir().join(format!(
      "soit_runs_trav_{}",
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let err = runs_dir(&dir, "..").unwrap_err();
    assert!(err.contains("..") || err.contains("run_id"), "{err}");
    let err2 = runs_dir(&dir, "foo/bar").unwrap_err();
    assert!(err2.contains("separator") || err2.contains("run_id"), "{err2}");
    let ok = runs_dir(&dir, "run_safe_1").unwrap();
    let runs_root = dunce::canonicalize(dir.join(".soit").join("runs")).unwrap();
    assert!(ok.starts_with(&runs_root));
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn non_mock_fails_when_spawn_disabled() {
    let control = HandoffControl::default();
    let args = StartHandoffArgs {
      card_id: "c_1".into(),
      runtime_id: "opencode".into(),
      brief_markdown: None,
    };
    let err = start_handoff_impl(&args, &prefs_spawn(false), &control, None).unwrap_err();
    assert!(err.contains("spawn disabled"), "{err}");
  }

  #[test]
  fn non_mock_fails_when_spawn_enabled_p0() {
    let control = HandoffControl::default();
    let args = StartHandoffArgs {
      card_id: "c_1".into(),
      runtime_id: "claude-code".into(),
      brief_markdown: None,
    };
    let err = start_handoff_impl(&args, &prefs_spawn(true), &control, None).unwrap_err();
    assert!(err.contains("not implemented"), "{err}");
  }

  #[test]
  fn mock_succeeds_without_vault() {
    let control = HandoffControl::default();
    let args = StartHandoffArgs {
      card_id: "c_1".into(),
      runtime_id: "mock".into(),
      brief_markdown: None,
    };
    let r = start_handoff_impl(&args, &prefs_spawn(false), &control, None).unwrap();
    assert_eq!(r.status, "succeeded");
    assert!(r.text.as_deref().unwrap_or("").contains("[["));
    assert!(control.active_run_id.lock().unwrap().is_none());
  }

  #[test]
  fn brief_requires_card_id() {
    let control = HandoffControl::default();
    let args = StartHandoffArgs {
      card_id: "  ".into(),
      runtime_id: "mock".into(),
      brief_markdown: Some("# brief".into()),
    };
    let err = start_handoff_impl(&args, &prefs_spawn(false), &control, None).unwrap_err();
    assert!(err.contains("card_id"), "{err}");
  }

  #[test]
  fn mock_writes_brief_under_runs() {
    let control = HandoffControl::default();
    let dir = std::env::temp_dir().join(format!(
      "soit_handoff_brief_{}",
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let args = StartHandoffArgs {
      card_id: "c_1".into(),
      runtime_id: "mock".into(),
      brief_markdown: Some("# Task\nhello".into()),
    };
    let r = start_handoff_impl(&args, &prefs_spawn(false), &control, Some(&dir)).unwrap();
    assert_eq!(r.status, "succeeded");
    let brief = dir
      .join(".soit")
      .join("runs")
      .join(&r.run_id)
      .join("brief.md");
    assert!(brief.is_file(), "{brief:?}");
    let body = std::fs::read_to_string(&brief).unwrap();
    assert!(body.contains("hello"));
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn cancel_sets_flag() {
    let control = HandoffControl::default();
    let r = cancel_handoff_impl(&control);
    assert!(r.ok);
    assert!(control.cancel.load(Ordering::SeqCst));
  }

  #[test]
  fn handoff_result_camel_case() {
    let r = HandoffResult {
      run_id: "run_1".into(),
      status: "succeeded".into(),
      text: Some("t".into()),
      error: None,
    };
    let json = serde_json::to_string(&r).unwrap();
    assert!(json.contains("runId"));
    assert!(json.contains("status"));
    assert!(!json.contains("error"));
  }
}
