//! Reverse read-only MCP server — `soit mcp serve` stdio subcommand.
//!
//! Read-only JSON-RPC 2.0 over newline-delimited stdio. Multi-workspace:
//! registry of allowed vaults (explicit `--vault` + session recents), lazy
//! `Universe::open_readonly` + cache, `list_workspaces` / `select_workspace`
//! tools, optional `vault` param on the 5 read tools. No write tools, no raw
//! SQL, no HTTP.

mod clean;
mod jsonrpc;
mod tools;
mod workspaces;

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use crate::session_config;
use crate::universe::Universe;

const PROTOCOL_VERSION: &str = "2025-06-18";

/// Startup config assembled by `main.rs::run_mcp`.
pub struct McpServeConfig {
  /// Allowlist registry (explicit + recents, order-preserving, deduped).
  pub registry: Vec<String>,
  pub allow_any: bool,
  /// Default selected workspace (first explicit, else lastVault).
  pub default: Option<String>,
  /// `lastVault` raw — for `list_workspaces` `isLast` display only.
  pub last_vault: Option<String>,
}

/// Read `(recentVaults, lastVault)` from `soit-session.json` (no AppHandle).
fn session_recents() -> (Vec<String>, Option<String>) {
  match session_config::read_session_raw_no_app() {
    Some(raw) => {
      let cfg = session_config::migrate_session_value(&raw);
      (cfg.recent_vaults, cfg.last_vault)
    }
    None => (vec![], None),
  }
}

impl McpServeConfig {
  /// Assemble config from explicit CLI vaults (already validated absolute by
  /// the caller) plus session recents. Registry + default computed here.
  pub fn from_cli(explicit: Vec<String>, allow_any: bool) -> Self {
    let (recents, last_vault) = session_recents();
    let (registry, default) =
      workspaces::build_registry(&explicit, &recents, last_vault.as_deref());
    McpServeConfig {
      registry,
      allow_any,
      default,
      last_vault,
    }
  }
}

/// Per-process MCP state. Single-threaded stdio loop → no locks.
pub struct McpState {
  open: HashMap<PathBuf, Universe>,
  allowlist: Vec<String>,
  allow_any: bool,
  selected: Option<PathBuf>,
  last_vault: Option<String>,
}

impl McpState {
  pub fn new(config: McpServeConfig) -> Self {
    let selected = config
      .default
      .as_deref()
      .and_then(workspaces::canonicalize_vault);
    McpState {
      open: HashMap::new(),
      allowlist: config.registry,
      allow_any: config.allow_any,
      selected,
      last_vault: config.last_vault,
    }
  }

  /// Resolve vault: `args.vault` > `selected` > single allowlist entry >
  /// readable error. Returns a cached or freshly-opened read-only Universe.
  pub fn resolve_vault(&mut self, args: Option<&Value>) -> Result<&mut Universe, String> {
    let args_vault = args
      .and_then(Value::as_object)
      .and_then(|o| o.get("vault"))
      .and_then(Value::as_str);
    let selected = self.selected.clone();
    let target = workspaces::resolve_target(args_vault, selected.as_deref(), &self.allowlist)?;
    if !workspaces::is_allowed(&self.allowlist, self.allow_any, &target) {
      return Err(format!(
        "vault not in allowlist: {target}. Run list_workspaces to see registered workspaces."
      ));
    }
    let canon = workspaces::canonicalize_vault(&target)
      .ok_or_else(|| format!("cannot resolve vault path: {target}"))?;
    self.open_or_cached(canon)
  }

  fn open_or_cached(&mut self, canon: PathBuf) -> Result<&mut Universe, String> {
    use std::collections::hash_map::Entry;
    match self.open.entry(canon.clone()) {
      Entry::Occupied(e) => Ok(e.into_mut()),
      Entry::Vacant(e) => {
        let u = Universe::open_readonly(&canon)
          .map_err(|err| format!("open vault {}: {err}", canon.display()))?;
        Ok(e.insert(u))
      }
    }
  }

  /// Session-scoped selection (process lifetime; not persisted across restarts).
  pub fn select_workspace(&mut self, path: &str) -> Result<String, String> {
    let t = path.trim();
    if t.is_empty() {
      return Err("empty workspace path".into());
    }
    if !workspaces::is_allowed(&self.allowlist, self.allow_any, t) {
      return Err(format!(
        "workspace not allowed: {t}. Run list_workspaces to see registered workspaces."
      ));
    }
    let canon = workspaces::canonicalize_vault(t)
      .ok_or_else(|| format!("cannot resolve vault path: {t}"))?;
    self.selected = Some(canon);
    Ok(t.to_string())
  }

  /// Registry listing — zero DB IO.
  pub fn list_workspaces(&self) -> Vec<Value> {
    self
      .allowlist
      .iter()
      .map(|p| {
        let label = Path::new(p)
          .file_name()
          .map(|s| s.to_string_lossy().to_string())
          .unwrap_or_else(|| p.clone());
        let is_last = self
          .last_vault
          .as_deref()
          .map(|l| l.trim() == p.trim())
          .unwrap_or(false);
        json!({ "path": p, "label": label, "isLast": is_last })
      })
      .collect()
  }
}

/// Run the stdio MCP server against a registry of allowed read-only vaults.
pub fn run_stdio_serve(config: McpServeConfig) -> Result<(), String> {
  let mut state = McpState::new(config);
  let stdin = std::io::stdin();
  let stdout = std::io::stdout();
  let mut reader = BufReader::new(stdin.lock());
  let mut writer = stdout.lock();

  loop {
    let mut line = String::new();
    let n = reader
      .read_line(&mut line)
      .map_err(|e| format!("read stdin: {e}"))?;
    if n == 0 {
      break; // EOF
    }
    let trimmed = line.trim_end_matches(['\r', '\n']);
    if trimmed.trim().is_empty() {
      continue;
    }
    if let Some(response) = handle_line(trimmed, &mut state) {
      jsonrpc::write_message(&mut writer, &response)
        .map_err(|e| format!("write stdout: {e}"))?;
    }
  }
  Ok(())
}

/// Dispatch one line. Returns Some(response) for requests, None for notifications.
fn handle_line(line: &str, state: &mut McpState) -> Option<Value> {
  let msg = match jsonrpc::parse_message(line) {
    Ok(m) => m,
    Err((code, reason)) => return Some(jsonrpc::error_response(None, code, &reason)),
  };
  // Notifications (no id, incl. `notifications/initialized`) produce no response.
  let Some(id) = msg.id.as_ref() else {
    return None;
  };
  Some(dispatch(&msg.method, msg.params.as_ref(), id, state))
}

fn dispatch(method: &str, params: Option<&Value>, id: &Value, state: &mut McpState) -> Value {
  match method {
    "initialize" => jsonrpc::success_response(id, initialize_result()),
    "ping" => jsonrpc::success_response(id, json!({})),
    "tools/list" => jsonrpc::success_response(id, json!({ "tools": tools::tool_definitions() })),
    "tools/call" => {
      let Some(params) = params else {
        return jsonrpc::error_response(Some(id), jsonrpc::INVALID_PARAMS, "missing params");
      };
      let Some(name) = params.get("name").and_then(Value::as_str) else {
        return jsonrpc::error_response(Some(id), jsonrpc::INVALID_PARAMS, "missing tool name");
      };
      let result = tools::call_tool(name, params.get("arguments"), state);
      let mut body = json!({ "content": result.content });
      if result.is_error {
        body["isError"] = json!(true);
      }
      jsonrpc::success_response(id, body)
    }
    _ => jsonrpc::error_response(Some(id), jsonrpc::METHOD_NOT_FOUND, "method not found"),
  }
}

fn initialize_result() -> Value {
  json!({
    "protocolVersion": PROTOCOL_VERSION,
    "capabilities": { "tools": {} },
    "serverInfo": { "name": "soit", "version": env!("CARGO_PKG_VERSION") }
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::universe::Universe;

  fn seed_state(label: &str) -> (std::path::PathBuf, McpState) {
    let ms = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|d| d.as_millis())
      .unwrap_or(0);
    let dir = std::env::temp_dir().join(format!("soit_mcp_disp_{label}_{ms}"));
    std::fs::create_dir_all(&dir).unwrap();
    {
      let mut u = Universe::open(&dir).unwrap();
      u.create_root_inquiry("根", Some("问题")).unwrap();
    }
    let canon = dir.canonicalize().unwrap().to_string_lossy().to_string();
    let state = McpState::new(McpServeConfig {
      registry: vec![canon.clone()],
      allow_any: false,
      default: Some(canon.clone()),
      last_vault: Some(canon),
    });
    (dir, state)
  }

  #[test]
  fn dispatch_initialize_tools_and_call() {
    let (dir, mut state) = seed_state("dispatch");

    let init = handle_line(
      r#"{"jsonrpc":"2.0","id":1,"method":"initialize"}"#,
      &mut state,
    )
    .unwrap();
    assert_eq!(init["result"]["serverInfo"]["name"], "soit");
    assert_eq!(init["id"], 1);

    let list = handle_line(r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#, &mut state).unwrap();
    assert_eq!(list["result"]["tools"].as_array().unwrap().len(), 7);

    let call = handle_line(
      r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_cards","arguments":{}}}"#,
      &mut state,
    )
    .unwrap();
    assert!(call["result"].get("isError").is_none());
    let text = call["result"]["content"][0]["text"].as_str().unwrap();
    let cards = serde_json::from_str::<serde_json::Value>(text).unwrap();
    assert!(cards.as_array().unwrap().len() >= 1);

    let notif = handle_line(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#, &mut state);
    assert!(notif.is_none());

    let unknown = handle_line(r#"{"jsonrpc":"2.0","id":4,"method":"nope"}"#, &mut state).unwrap();
    assert_eq!(unknown["error"]["code"], jsonrpc::METHOD_NOT_FOUND);

    drop(state);
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn list_workspaces_and_select() {
    let a = std::env::temp_dir().join(format!(
      "soit_ws_a_{}",
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis()
    ));
    let b = std::env::temp_dir().join(format!(
      "soit_ws_b_{}",
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis()
    ));
    std::fs::create_dir_all(&a).unwrap();
    std::fs::create_dir_all(&b).unwrap();
    {
      let mut ua = Universe::open(&a).unwrap();
      ua.create_root_inquiry("A", None).unwrap();
      let mut ub = Universe::open(&b).unwrap();
      ub.create_root_inquiry("B", None).unwrap();
    }
    let a_c = a.canonicalize().unwrap().to_string_lossy().to_string();
    let b_c = b.canonicalize().unwrap().to_string_lossy().to_string();

    let mut state = McpState::new(McpServeConfig {
      registry: vec![a_c.clone(), b_c.clone()],
      allow_any: false,
      default: Some(a_c.clone()),
      last_vault: Some(b_c.clone()),
    });

    // list workspaces (zero DB IO — no open yet)
    let ws = state.list_workspaces();
    assert_eq!(ws.len(), 2);
    assert_eq!(ws[0]["path"], a_c);
    assert_eq!(ws[0]["isLast"], false);
    assert_eq!(ws[1]["path"], b_c);
    assert_eq!(ws[1]["isLast"], true);

    // select b
    state.select_workspace(&b_c).unwrap();
    let u = state.resolve_vault(None).unwrap();
    let snap = u.snapshot().unwrap();
    assert!(snap.nodes.iter().any(|n| n.title == "B"));

    // vault param override to a
    let args = json!({ "vault": a_c });
    let u2 = state.resolve_vault(Some(&args)).unwrap();
    let snap2 = u2.snapshot().unwrap();
    assert!(snap2.nodes.iter().any(|n| n.title == "A"));

    // disallowed path rejected
    let bad = state.select_workspace("/not/in/allowlist");
    assert!(bad.is_err());

    drop(state);
    let _ = std::fs::remove_dir_all(&a);
    let _ = std::fs::remove_dir_all(&b);
  }

  #[test]
  fn multi_workspace_without_select_errors() {
    let a = std::env::temp_dir().join(format!(
      "soit_ws_multi_{}",
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis()
    ));
    std::fs::create_dir_all(&a).unwrap();
    {
      let mut ua = Universe::open(&a).unwrap();
      ua.create_root_inquiry("A", None).unwrap();
    }
    let a_c = a.canonicalize().unwrap().to_string_lossy().to_string();
    let b_c = "/tmp/soit_ws_multi_b_missing".to_string(); // not created — just a distinct allowlist entry

    let mut state = McpState::new(McpServeConfig {
      registry: vec![a_c, b_c],
      allow_any: false,
      default: None,
      last_vault: None,
    });

    let err = state.resolve_vault(None).unwrap_err();
    assert!(err.contains("list_workspaces"));

    drop(state);
    let _ = std::fs::remove_dir_all(&a);
  }

  #[test]
  fn lazy_open_failure_is_readable() {
    let a = std::env::temp_dir().join(format!(
      "soit_ws_badopen_{}",
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis()
    ));
    std::fs::create_dir_all(&a).unwrap(); // dir exists but no .soit/universe.db
    let a_c = a.canonicalize().unwrap().to_string_lossy().to_string();

    let mut state = McpState::new(McpServeConfig {
      registry: vec![a_c.clone()],
      allow_any: false,
      default: None,
      last_vault: None,
    });

    let err = state.resolve_vault(None).unwrap_err();
    assert!(err.contains(&a_c), "error should carry the vault path: {err}");

    drop(state);
    let _ = std::fs::remove_dir_all(&a);
  }
}
