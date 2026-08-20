//! External runtime bridge: detect, prefs (`soit-runtime.json`), mock handoff (P0).
//! No tauri-plugin-shell; CLI spawn is rejected in this slice.

mod detect;
mod handoff;
mod prefs;

pub use detect::RuntimeInfo;
pub use handoff::{CancelHandoffResult, HandoffControl, HandoffResult, StartHandoffArgs};
pub use prefs::RuntimePreferences;

use crate::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_runtimes(app: AppHandle) -> Result<Vec<RuntimeInfo>, String> {
  let prefs = prefs::read_prefs(&app);
  Ok(detect::list_runtimes_with_prefs(&prefs))
}

#[tauri::command]
pub fn get_runtime_prefs(app: AppHandle) -> Result<RuntimePreferences, String> {
  prefs::get_runtime_prefs(&app)
}

#[tauri::command]
pub fn set_runtime_prefs(
  app: AppHandle,
  prefs: RuntimePreferences,
) -> Result<RuntimePreferences, String> {
  prefs::set_runtime_prefs(&app, prefs)
}

#[tauri::command]
pub fn start_runtime_handoff(
  args: StartHandoffArgs,
  app: AppHandle,
  state: State<'_, AppState>,
) -> Result<HandoffResult, String> {
  let prefs = prefs::read_prefs(&app);
  let vault = state
    .universe
    .lock()
    .ok()
    .and_then(|g| g.as_ref().map(|u| u.vault_path.clone()));
  handoff::start_handoff_impl(
    &args,
    &prefs,
    &state.runtime_handoff,
    vault.as_deref(),
  )
}

#[tauri::command]
pub fn cancel_runtime_handoff(state: State<'_, AppState>) -> Result<CancelHandoffResult, String> {
  Ok(handoff::cancel_handoff_impl(&state.runtime_handoff))
}
