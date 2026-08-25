//! Reverse read-only MCP server — `soit mcp serve` stdio subcommand.
//!
//! Read-only JSON-RPC 2.0 over newline-delimited stdio, backed by a read-only
//! `Universe::open_readonly` connection. No write tools, no raw SQL, no HTTP.

mod clean;
mod jsonrpc;
mod tools;

use std::io::{BufRead, BufReader};
use std::path::Path;

use serde_json::{json, Value};

use crate::universe::Universe;

const PROTOCOL_VERSION: &str = "2025-06-18";

/// Run the stdio MCP server against a read-only view of `vault/.soit/universe.db`.
pub fn run_stdio_serve(vault: &Path) -> Result<(), String> {
  let universe = Universe::open_readonly(vault)?;
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
    if let Some(response) = handle_line(trimmed, &universe) {
      jsonrpc::write_message(&mut writer, &response)
        .map_err(|e| format!("write stdout: {e}"))?;
    }
  }
  Ok(())
}

/// Dispatch one line. Returns Some(response) for requests, None for notifications.
fn handle_line(line: &str, universe: &Universe) -> Option<Value> {
  let msg = match jsonrpc::parse_message(line) {
    Ok(m) => m,
    Err((code, reason)) => return Some(jsonrpc::error_response(None, code, &reason)),
  };
  // Notifications (no id, incl. `notifications/initialized`) produce no response.
  let Some(id) = msg.id.as_ref() else {
    return None;
  };
  Some(dispatch(&msg.method, msg.params.as_ref(), id, universe))
}

fn dispatch(method: &str, params: Option<&Value>, id: &Value, universe: &Universe) -> Value {
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
      let result = tools::call_tool(name, params.get("arguments"), universe);
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

  fn seed(label: &str) -> (std::path::PathBuf, Universe) {
    let ms = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|d| d.as_millis())
      .unwrap_or(0);
    let dir = std::env::temp_dir().join(format!("soit_mcp_disp_{label}_{ms}"));
    std::fs::create_dir_all(&dir).unwrap();
    let mut u = Universe::open(&dir).unwrap();
    u.create_root_inquiry("根", Some("问题")).unwrap();
    (dir, u)
  }

  #[test]
  fn dispatch_initialize_tools_and_call() {
    let (dir, u) = seed("dispatch");

    let init = handle_line(r#"{"jsonrpc":"2.0","id":1,"method":"initialize"}"#, &u).unwrap();
    assert_eq!(init["result"]["serverInfo"]["name"], "soit");
    assert_eq!(init["id"], 1);

    let list = handle_line(r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#, &u).unwrap();
    assert_eq!(list["result"]["tools"].as_array().unwrap().len(), 5);

    let call = handle_line(
      r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_cards","arguments":{}}}"#,
      &u,
    )
    .unwrap();
    assert!(call["result"].get("isError").is_none());
    let text = call["result"]["content"][0]["text"].as_str().unwrap();
    let cards = serde_json::from_str::<serde_json::Value>(text).unwrap();
    assert!(cards.as_array().unwrap().len() >= 1);

    let notif = handle_line(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#, &u);
    assert!(notif.is_none());

    let unknown = handle_line(r#"{"jsonrpc":"2.0","id":4,"method":"nope"}"#, &u).unwrap();
    assert_eq!(unknown["error"]["code"], jsonrpc::METHOD_NOT_FOUND);

    drop(u);
    let _ = std::fs::remove_dir_all(&dir);
  }
}
