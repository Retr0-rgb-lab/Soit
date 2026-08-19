mod obsidian;
mod universe;

use serde::Serialize;
use std::sync::Mutex;
use tauri::State;
use universe::{OpenUniverseResult, Universe, WorkspaceSnapshotDto};

struct AppState {
  /// Open universe (vault + db). None = unbound.
  universe: Mutex<Option<Universe>>,
}

impl Default for AppState {
  fn default() -> Self {
    Self {
      universe: Mutex::new(None),
    }
  }
}

#[derive(Serialize, Clone)]
struct BootstrapState {
  phase: &'static str,
  vault: Option<String>,
  version: String,
}

#[derive(Serialize)]
struct SelectVaultResult {
  ok: bool,
  path: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  error: Option<String>,
}



fn bootstrap_from(vault: Option<String>) -> BootstrapState {
  BootstrapState {
    phase: "ready_ui",
    vault,
    version: env!("CARGO_PKG_VERSION").to_string(),
  }
}

fn demo_shaped_empty_snapshot() -> WorkspaceSnapshotDto {
  WorkspaceSnapshotDto {
    source: "demo".into(),
    nodes: vec![],
    turns_by_card_id: std::collections::BTreeMap::new(),
    focus_id: String::new(),
  }
}

fn open_universe_impl(path: String, state: &AppState) -> OpenUniverseResult {
  let p = std::path::Path::new(&path);
  match Universe::open(p) {
    Ok(u) => {
      let snap = match u.snapshot() {
        Ok(s) => s,
        Err(e) => {
          return OpenUniverseResult {
            ok: false,
            path,
            error: Some(e),
            snapshot: None,
          };
        }
      };
      if let Ok(mut g) = state.universe.lock() {
        *g = Some(u);
      }
      OpenUniverseResult {
        ok: true,
        path,
        error: None,
        snapshot: Some(snap),
      }
    }
    Err(e) => OpenUniverseResult {
      ok: false,
      path,
      error: Some(e),
      snapshot: None,
    },
  }
}

/// Instant UI-ready bootstrap — no vault walk, no DB, no network.
#[tauri::command]
fn get_bootstrap_state(state: State<'_, AppState>) -> BootstrapState {
  let vault = state
    .universe
    .lock()
    .ok()
    .and_then(|g| g.as_ref().map(|u| u.vault_path.to_string_lossy().to_string()));
  bootstrap_from(vault)
}

/// Read snapshot from open universe, or demo-shaped empty when unbound.
#[tauri::command]
fn get_workspace_snapshot(state: State<'_, AppState>) -> Result<WorkspaceSnapshotDto, String> {
  let g = state
    .universe
    .lock()
    .map_err(|_| "universe lock poisoned".to_string())?;
  match g.as_ref() {
    Some(u) => u.snapshot(),
    None => Ok(demo_shaped_empty_snapshot()),
  }
}

/// Open vault → ensure .soit/universe.db → return snapshot (empty|universe).
#[tauri::command]
fn open_universe(path: String, state: State<'_, AppState>) -> OpenUniverseResult {
  open_universe_impl(path, &state)
}

/// Close DB and clear vault binding.
#[tauri::command]
fn close_universe(state: State<'_, AppState>) -> Result<(), String> {
  let mut g = state
    .universe
    .lock()
    .map_err(|_| "universe lock poisoned".to_string())?;
  *g = None;
  Ok(())
}

/// Thin compat wrapper: bind vault by opening universe.
#[tauri::command]
fn select_vault(path: String, state: State<'_, AppState>) -> SelectVaultResult {
  let r = open_universe_impl(path, &state);
  SelectVaultResult {
    ok: r.ok,
    path: r.path,
    error: r.error,
  }
}

/// Create a root inquiry card in the open universe (host-generated ids).
#[tauri::command]
fn create_root_inquiry(
  title: String,
  question: Option<String>,
  state: State<'_, AppState>,
) -> Result<WorkspaceSnapshotDto, String> {
  let mut g = state
    .universe
    .lock()
    .map_err(|_| "universe lock poisoned".to_string())?;
  let u = g
    .as_mut()
    .ok_or_else(|| "no universe open — bind a vault first".to_string())?;
  u.create_root_inquiry(&title, question.as_deref())
}

#[tauri::command]
fn ping() -> &'static str {
  "pong"
}

/// Precipitate a concept page under vault/concepts/{slug}.md (Wave D).
#[tauri::command]
fn precipitate_concept(
  card_id: String,
  title: String,
  question: Option<String>,
  body_hint: Option<String>,
  state: State<'_, AppState>,
) -> Result<obsidian::PrecipitateConceptResult, String> {
  let g = state
    .universe
    .lock()
    .map_err(|_| "universe lock poisoned".to_string())?;
  let u = g
    .as_ref()
    .ok_or_else(|| "no universe open — bind a vault first".to_string())?;
  Ok(obsidian::write_concept(
    &u.vault_path,
    &card_id,
    &title,
    question.as_deref(),
    body_hint.as_deref(),
  ))
}

/// Append a short residue note under vault/inquiry/ (Wave D).
#[tauri::command]
fn append_residue(
  card_id: String,
  text: String,
  state: State<'_, AppState>,
) -> Result<obsidian::AppendResidueResult, String> {
  let g = state
    .universe
    .lock()
    .map_err(|_| "universe lock poisoned".to_string())?;
  let u = g
    .as_ref()
    .ok_or_else(|| "no universe open — bind a vault first".to_string())?;
  Ok(obsidian::write_residue(&u.vault_path, &card_id, &text))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(AppState::default())
    .invoke_handler(tauri::generate_handler![
      get_bootstrap_state,
      get_workspace_snapshot,
      open_universe,
      close_universe,
      select_vault,
      create_root_inquiry,
      precipitate_concept,
      append_residue,
      ping
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn bootstrap_returns_ready_immediately() {
    let boot = bootstrap_from(None);
    assert_eq!(boot.phase, "ready_ui");
    assert!(boot.vault.is_none());
    assert!(!boot.version.is_empty());
  }

  #[test]
  fn open_universe_rejects_missing_path() {
    let state = AppState::default();
    let missing = open_universe_impl(
      "Z:\\this-path-should-not-exist-soit-test-xyz".into(),
      &state,
    );
    assert!(!missing.ok);
    assert!(missing.error.is_some());
    assert!(state.universe.lock().unwrap().is_none());
  }

  #[test]
  fn open_universe_accepts_existing_dir_and_snapshot_empty() {
    let state = AppState::default();
    let dir = std::env::temp_dir().join(format!(
      "soit_cmd_test_{}",
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.to_string_lossy().to_string();
    let ok = open_universe_impl(path.clone(), &state);
    assert!(ok.ok, "{:?}", ok.error);
    assert!(state.universe.lock().unwrap().is_some());
    let snap = ok.snapshot.expect("snapshot");
    assert_eq!(snap.source, "empty");
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn unbound_snapshot_is_demo_source() {
    let state = AppState::default();
    let g = state.universe.lock().unwrap();
    assert!(g.is_none());
    drop(g);
    // mirror command logic
    let snap = demo_shaped_empty_snapshot();
    assert_eq!(snap.source, "demo");
    assert!(snap.nodes.is_empty());
  }
}
