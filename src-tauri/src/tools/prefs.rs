//! Inquiry tools prefs — `{app_config_dir}/soit-tools.json` (not universe.db).

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WebSearchBackend {
  Off,
  Ddg,
  Tavily,
}

impl Default for WebSearchBackend {
  fn default() -> Self {
    WebSearchBackend::Off
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolsPrefsDto {
  pub version: u32,
  #[serde(default = "default_true")]
  pub tools_enabled: bool,
  #[serde(default = "default_rounds")]
  pub max_tool_rounds: u32,
  #[serde(default)]
  pub web_search_backend: WebSearchBackend,
  #[serde(default)]
  pub tavily_api_key: String,
  #[serde(default)]
  pub allow_loopback_fetch: bool,
}

fn default_true() -> bool {
  true
}

fn default_rounds() -> u32 {
  3
}

impl Default for ToolsPrefsDto {
  fn default() -> Self {
    Self {
      version: 1,
      tools_enabled: true,
      max_tool_rounds: 3,
      web_search_backend: WebSearchBackend::Off,
      tavily_api_key: String::new(),
      allow_loopback_fetch: false,
    }
  }
}

impl ToolsPrefsDto {
  pub fn normalize(mut self) -> Self {
    self.version = 1;
    if self.max_tool_rounds < 1 {
      self.max_tool_rounds = 1;
    }
    if self.max_tool_rounds > 5 {
      self.max_tool_rounds = 5;
    }
    self
  }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_config_dir()
    .map_err(|e| format!("app_config_dir: {e}"))?;
  fs::create_dir_all(&dir).map_err(|e| format!("create config dir: {e}"))?;
  Ok(dir.join("soit-tools.json"))
}

pub fn load_prefs(app: &AppHandle) -> Result<ToolsPrefsDto, String> {
  let path = config_path(app)?;
  if !path.exists() {
    return Ok(ToolsPrefsDto::default());
  }
  let raw = fs::read_to_string(&path).map_err(|e| format!("read tools prefs: {e}"))?;
  let dto: ToolsPrefsDto =
    serde_json::from_str(&raw).map_err(|e| format!("parse tools prefs: {e}"))?;
  Ok(dto.normalize())
}

pub fn save_prefs(app: &AppHandle, prefs: &ToolsPrefsDto) -> Result<ToolsPrefsDto, String> {
  let normalized = prefs.clone().normalize();
  let path = config_path(app)?;
  let raw = serde_json::to_string_pretty(&normalized)
    .map_err(|e| format!("serialize tools prefs: {e}"))?;
  fs::write(&path, raw).map_err(|e| format!("write tools prefs: {e}"))?;
  Ok(normalized)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn clamp_rounds() {
    let p = ToolsPrefsDto {
      max_tool_rounds: 99,
      ..Default::default()
    }
    .normalize();
    assert_eq!(p.max_tool_rounds, 5);
    let p2 = ToolsPrefsDto {
      max_tool_rounds: 0,
      ..Default::default()
    }
    .normalize();
    assert_eq!(p2.max_tool_rounds, 1);
  }

  #[test]
  fn default_web_off() {
    assert_eq!(
      ToolsPrefsDto::default().web_search_backend,
      WebSearchBackend::Off
    );
  }
}
