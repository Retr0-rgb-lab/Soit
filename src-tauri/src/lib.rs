use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

#[derive(Default)]
struct AppState {
  vault: Mutex<Option<String>>,
}

#[derive(Serialize, Clone)]
struct BootstrapState {
  phase: &'static str,
  vault: Option<String>,
  version: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSnapshot {
  source: &'static str,
  nodes: Vec<serde_json::Value>,
  turns_by_card_id: serde_json::Map<String, serde_json::Value>,
  focus_id: String,
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

fn select_vault_impl(path: String, vault_slot: &Mutex<Option<String>>) -> SelectVaultResult {
  let p = std::path::Path::new(&path);
  if !p.exists() {
    return SelectVaultResult {
      ok: false,
      path,
      error: Some("path does not exist".into()),
    };
  }
  if let Ok(mut g) = vault_slot.lock() {
    *g = Some(path.clone());
  }
  SelectVaultResult {
    ok: true,
    path,
    error: None,
  }
}

/// Instant UI-ready bootstrap — no vault walk, no DB, no network.
#[tauri::command]
fn get_bootstrap_state(state: State<'_, AppState>) -> BootstrapState {
  let vault = state.vault.lock().ok().and_then(|g| g.clone());
  bootstrap_from(vault)
}

/// Demo/empty snapshot stub. Full seed lives in frontend demoSeed when nodes empty.
#[tauri::command]
fn get_workspace_snapshot(state: State<'_, AppState>) -> WorkspaceSnapshot {
  let has_vault = state
    .vault
    .lock()
    .map(|g| g.is_some())
    .unwrap_or(false);
  WorkspaceSnapshot {
    source: if has_vault { "empty" } else { "demo" },
    nodes: vec![],
    turns_by_card_id: serde_json::Map::new(),
    focus_id: String::new(),
  }
}

/// Memory-only vault path. Validates existence; never creates db.
#[tauri::command]
fn select_vault(path: String, state: State<'_, AppState>) -> SelectVaultResult {
  select_vault_impl(path, &state.vault)
}

#[tauri::command]
fn ping() -> &'static str {
  "pong"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(AppState::default())
    .invoke_handler(tauri::generate_handler![
      get_bootstrap_state,
      get_workspace_snapshot,
      select_vault,
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
  fn select_vault_rejects_missing_path() {
    let slot = Mutex::new(None);
    let missing = select_vault_impl(
      "Z:\\this-path-should-not-exist-soit-test-xyz".into(),
      &slot,
    );
    assert!(!missing.ok);
    assert!(missing.error.is_some());
    assert!(slot.lock().unwrap().is_none());
  }

  #[test]
  fn select_vault_accepts_existing_path() {
    let slot = Mutex::new(None);
    let dir = std::env::temp_dir();
    let path = dir.to_string_lossy().to_string();
    let ok = select_vault_impl(path.clone(), &slot);
    assert!(ok.ok);
    assert_eq!(slot.lock().unwrap().as_deref(), Some(path.as_str()));
  }
}
