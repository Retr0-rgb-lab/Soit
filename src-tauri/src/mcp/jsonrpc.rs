//! Minimal JSON-RPC 2.0 message model + framing for the stdio MCP server.
//!
//! Newline-delimited JSON (one message per line), not LSP Content-Length.
//! P0 handles single-object requests/notifications only; batch arrays are
//! rejected as invalid requests.

use serde_json::Value;
use std::io::Write;

pub const PARSE_ERROR: i64 = -32700;
pub const INVALID_REQUEST: i64 = -32600;
pub const METHOD_NOT_FOUND: i64 = -32601;
pub const INVALID_PARAMS: i64 = -32602;

/// A parsed inbound JSON-RPC message. `id == None` means a notification.
#[derive(Debug, Clone)]
pub struct Message {
  pub id: Option<Value>,
  pub method: String,
  pub params: Option<Value>,
}

/// Parse one line into a Message. On failure returns (code, reason).
pub fn parse_message(line: &str) -> Result<Message, (i64, String)> {
  let v: Value = serde_json::from_str(line.trim())
    .map_err(|e| (PARSE_ERROR, format!("parse error: {e}")))?;
  let obj = v
    .as_object()
    .ok_or((INVALID_REQUEST, "request must be a JSON object".into()))?;
  let method = obj
    .get("method")
    .and_then(Value::as_str)
    .ok_or((INVALID_REQUEST, "missing method".into()))?
    .to_string();
  Ok(Message {
    id: obj.get("id").cloned(),
    method,
    params: obj.get("params").cloned(),
  })
}

pub fn success_response(id: &Value, result: Value) -> Value {
  serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

pub fn error_response(id: Option<&Value>, code: i64, message: &str) -> Value {
  match id {
    Some(id) => serde_json::json!({
      "jsonrpc": "2.0",
      "id": id,
      "error": { "code": code, "message": message }
    }),
    None => serde_json::json!({
      "jsonrpc": "2.0",
      "id": null,
      "error": { "code": code, "message": message }
    }),
  }
}

/// Write one JSON-RPC message as a newline-terminated line and flush.
pub fn write_message<W: Write>(writer: &mut W, msg: &Value) -> std::io::Result<()> {
  let s = serde_json::to_string(msg)
    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
  writer.write_all(s.as_bytes())?;
  writer.write_all(b"\n")?;
  writer.flush()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parse_request_and_notification() {
    let m = parse_message(r#"{"jsonrpc":"2.0","id":1,"method":"tools/list"}"#).unwrap();
    assert_eq!(m.id, Some(serde_json::json!(1)));
    assert_eq!(m.method, "tools/list");
    assert!(m.params.is_none());

    let n =
      parse_message(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#).unwrap();
    assert!(n.id.is_none());
    assert_eq!(n.method, "notifications/initialized");
  }

  #[test]
  fn parse_errors() {
    let (code, _) = parse_message("not json").unwrap_err();
    assert_eq!(code, PARSE_ERROR);
    let (code, _) = parse_message(r#"{"id":1}"#).unwrap_err();
    assert_eq!(code, INVALID_REQUEST);
  }

  #[test]
  fn response_shapes() {
    let ok = success_response(&serde_json::json!(7), serde_json::json!({"tools": []}));
    assert_eq!(ok["jsonrpc"], "2.0");
    assert_eq!(ok["id"], 7);
    assert!(ok["result"].is_object());

    let err = error_response(Some(&serde_json::json!(7)), METHOD_NOT_FOUND, "nope");
    assert_eq!(err["error"]["code"], METHOD_NOT_FOUND);
    assert_eq!(err["id"], 7);
  }

  #[test]
  fn write_message_emits_newline() {
    let mut buf: Vec<u8> = Vec::new();
    write_message(&mut buf, &serde_json::json!({"jsonrpc":"2.0","id":1,"result":{}})).unwrap();
    let s = String::from_utf8(buf).unwrap();
    assert!(s.ends_with('\n'));
    assert_eq!(serde_json::from_str::<Value>(s.trim()).unwrap()["id"], 1);
  }
}
