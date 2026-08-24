//! Read-only MCP tool schemas + handlers over `Universe::snapshot()`.
//!
//! P0 loads the full snapshot once per call and filters in memory. No raw SQL,
//! no write tools.

use serde_json::{json, Value};

use crate::universe::{InquiryNodeDto, TurnDto, Universe, WorkspaceSnapshotDto};

pub struct ToolResult {
  pub content: Vec<Value>,
  pub is_error: bool,
}

fn ok_text(value: Value) -> ToolResult {
  let text = serde_json::to_string_pretty(&value).unwrap_or_else(|_| "{}".to_string());
  ToolResult {
    content: vec![json!({ "type": "text", "text": text })],
    is_error: false,
  }
}

fn error_text(message: &str) -> ToolResult {
  ToolResult {
    content: vec![json!({ "type": "text", "text": message })],
    is_error: true,
  }
}

fn node_value(node: &InquiryNodeDto) -> Value {
  serde_json::to_value(node).unwrap_or(Value::Null)
}

fn turn_value(turn: &TurnDto) -> Value {
  serde_json::to_value(turn).unwrap_or(Value::Null)
}

fn card_with_turns(node: &InquiryNodeDto, turns: &[TurnDto]) -> Value {
  let mut v = node_value(node);
  let arr: Vec<Value> = turns.iter().map(turn_value).collect();
  if let Some(obj) = v.as_object_mut() {
    obj.insert("turns".into(), Value::Array(arr));
  }
  v
}

fn arg_str(args: Option<&Value>, key: &str) -> Option<String> {
  args
    .and_then(Value::as_object)
    .and_then(|o| o.get(key))
    .and_then(Value::as_str)
    .map(String::from)
}

fn tool_def(name: &str, description: &str, input_schema: Value) -> Value {
  json!({ "name": name, "description": description, "inputSchema": input_schema })
}

pub fn tool_definitions() -> Vec<Value> {
  vec![
    tool_def(
      "list_cards",
      "List all inquiry cards in the Soit universe (optionally filtered by status/kind).",
      json!({
        "type": "object",
        "properties": {
          "status": { "type": "string" },
          "kind": { "type": "string" }
        },
        "additionalProperties": false
      }),
    ),
    tool_def(
      "read_card",
      "Read one inquiry card's fields plus its conversation turns.",
      json!({
        "type": "object",
        "properties": { "cardId": { "type": "string" } },
        "required": ["cardId"],
        "additionalProperties": false
      }),
    ),
    tool_def(
      "list_turns",
      "List the conversation turns of one inquiry card.",
      json!({
        "type": "object",
        "properties": { "cardId": { "type": "string" } },
        "required": ["cardId"],
        "additionalProperties": false
      }),
    ),
    tool_def(
      "read_turn",
      "Read a single conversation turn on an inquiry card.",
      json!({
        "type": "object",
        "properties": {
          "cardId": { "type": "string" },
          "turnId": { "type": "string" }
        },
        "required": ["cardId", "turnId"],
        "additionalProperties": false
      }),
    ),
    tool_def(
      "search_cards",
      "Case-insensitive substring search over card title/question/stuck/next.",
      json!({
        "type": "object",
        "properties": { "query": { "type": "string" } },
        "required": ["query"],
        "additionalProperties": false
      }),
    ),
  ]
}

/// Execute one read-only tool. `name` is already validated non-empty by caller.
pub fn call_tool(name: &str, arguments: Option<&Value>, universe: &Universe) -> ToolResult {
  let snapshot = match universe.snapshot() {
    Ok(s) => s,
    Err(e) => return error_text(&format!("read universe: {e}")),
  };
  match name {
    "list_cards" => list_cards(&snapshot, arguments),
    "read_card" => read_card(&snapshot, arguments),
    "list_turns" => list_turns(&snapshot, arguments),
    "read_turn" => read_turn(&snapshot, arguments),
    "search_cards" => search_cards(&snapshot, arguments),
    _ => error_text("unknown tool"),
  }
}

fn list_cards(snapshot: &WorkspaceSnapshotDto, args: Option<&Value>) -> ToolResult {
  let status = arg_str(args, "status");
  let kind = arg_str(args, "kind");
  let cards: Vec<Value> = snapshot
    .nodes
    .iter()
    .filter(|n| status.as_deref().map_or(true, |s| n.status.as_deref() == Some(s)))
    .filter(|n| kind.as_deref().map_or(true, |k| n.kind.as_str() == k))
    .map(node_value)
    .collect();
  ok_text(Value::Array(cards))
}

fn read_card(snapshot: &WorkspaceSnapshotDto, args: Option<&Value>) -> ToolResult {
  let Some(card_id) = arg_str(args, "cardId") else {
    return error_text("missing required parameter: cardId");
  };
  let Some(node) = snapshot.nodes.iter().find(|n| n.id == card_id) else {
    return error_text(&format!("card not found: {card_id}"));
  };
  let turns = snapshot
    .turns_by_card_id
    .get(&card_id)
    .map(Vec::as_slice)
    .unwrap_or(&[]);
  ok_text(card_with_turns(node, turns))
}

fn list_turns(snapshot: &WorkspaceSnapshotDto, args: Option<&Value>) -> ToolResult {
  let Some(card_id) = arg_str(args, "cardId") else {
    return error_text("missing required parameter: cardId");
  };
  if !snapshot.nodes.iter().any(|n| n.id == card_id) {
    return error_text(&format!("card not found: {card_id}"));
  }
  let turns: Vec<Value> = snapshot
    .turns_by_card_id
    .get(&card_id)
    .map(|v| v.iter().map(turn_value).collect())
    .unwrap_or_default();
  ok_text(Value::Array(turns))
}

fn read_turn(snapshot: &WorkspaceSnapshotDto, args: Option<&Value>) -> ToolResult {
  let Some(card_id) = arg_str(args, "cardId") else {
    return error_text("missing required parameter: cardId");
  };
  let Some(turn_id) = arg_str(args, "turnId") else {
    return error_text("missing required parameter: turnId");
  };
  let Some(turn) = snapshot
    .turns_by_card_id
    .get(&card_id)
    .and_then(|v| v.iter().find(|t| t.id == turn_id))
  else {
    return error_text(&format!("turn not found: {card_id}/{turn_id}"));
  };
  ok_text(turn_value(turn))
}

fn search_cards(snapshot: &WorkspaceSnapshotDto, args: Option<&Value>) -> ToolResult {
  let Some(query) = arg_str(args, "query") else {
    return error_text("missing required parameter: query");
  };
  let needle = query.to_lowercase();
  let cards: Vec<Value> = snapshot
    .nodes
    .iter()
    .filter(|n| {
      let hay = format!(
        "{} {} {} {}",
        n.title,
        n.question.as_deref().unwrap_or(""),
        n.stuck.as_deref().unwrap_or(""),
        n.next.as_deref().unwrap_or("")
      )
      .to_lowercase();
      hay.contains(&needle)
    })
    .map(node_value)
    .collect();
  ok_text(Value::Array(cards))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::universe::{SourceSpanDto, SpawnInquiryArgs};
  use std::path::PathBuf;

  fn now_ms() -> u128 {
    std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|d| d.as_millis())
      .unwrap_or(0)
  }

  fn seed_vault(label: &str) -> (PathBuf, Universe, String, String) {
    let dir = std::env::temp_dir().join(format!("soit_mcp_{label}_{}", now_ms()));
    std::fs::create_dir_all(&dir).unwrap();
    let mut u = Universe::open(&dir).unwrap();
    let root = u.create_root_inquiry("根卡", Some("什么是函子")).unwrap();
    let root_id = root.nodes[0].id.clone();
    u.append_turn(&root_id, None, "用户追问", None).unwrap();
    let child = u
      .spawn_inquiry(&SpawnInquiryArgs {
        kind: "deepen".into(),
        from_card_id: root_id.clone(),
        source: SourceSpanDto {
          turn_id: "t_src".into(),
          text: "函子".into(),
          mark_id: None,
          start: None,
          end: None,
          doc_path: None,
          doc_page: None,
          doc_kind: None,
        },
        why: None,
        actor: None,
      })
      .unwrap();
    let child_id = child
      .nodes
      .iter()
      .find(|n| n.kind == "deepen")
      .unwrap()
      .id
      .clone();
    (dir, u, root_id, child_id)
  }

  fn text_of(result: &ToolResult) -> Value {
    let text = result.content[0]["text"].as_str().unwrap();
    serde_json::from_str(text).unwrap()
  }

  #[test]
  fn tool_definitions_has_five() {
    let defs = tool_definitions();
    assert_eq!(defs.len(), 5);
    let names: Vec<&str> = defs.iter().map(|t| t["name"].as_str().unwrap()).collect();
    for n in ["list_cards", "read_card", "list_turns", "read_turn", "search_cards"] {
      assert!(names.contains(&n));
    }
  }

  #[test]
  fn list_cards_and_filters() {
    let (dir, u, _root, _child) = seed_vault("list");
    let all = call_tool("list_cards", None, &u);
    assert!(!all.is_error);
    assert_eq!(text_of(&all).as_array().unwrap().len(), 2);

    let filtered = call_tool("list_cards", Some(&json!({"kind": "deepen"})), &u);
    let cards = text_of(&filtered);
    assert_eq!(cards.as_array().unwrap().len(), 1);
    assert_eq!(cards[0]["kind"], "deepen");
    drop(u);
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn read_card_returns_card_and_turns() {
    let (dir, u, root_id, _child) = seed_vault("read");
    let r = call_tool("read_card", Some(&json!({"cardId": root_id})), &u);
    assert!(!r.is_error);
    let v = text_of(&r);
    assert_eq!(v["id"], root_id);
    assert!(v["turns"].as_array().unwrap().len() >= 2);

    let missing = call_tool("read_card", Some(&json!({"cardId": "nope"})), &u);
    assert!(missing.is_error);
    drop(u);
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn list_turns_and_read_turn() {
    let (dir, u, root_id, _child) = seed_vault("turns");
    let list = call_tool("list_turns", Some(&json!({"cardId": root_id})), &u);
    let turns = text_of(&list);
    assert!(turns.as_array().unwrap().len() >= 2);
    let first_id = turns[0]["id"].as_str().unwrap().to_string();

    let one = call_tool(
      "read_turn",
      Some(&json!({"cardId": root_id, "turnId": first_id})),
      &u,
    );
    let v = text_of(&one);
    assert_eq!(v["id"], first_id);
    drop(u);
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn search_cards_matches_case_insensitive() {
    let (dir, u, _root, _child) = seed_vault("search");
    let r = call_tool("search_cards", Some(&json!({"query": "函子"})), &u);
    let cards = text_of(&r);
    assert!(cards.as_array().unwrap().len() >= 1);
    drop(u);
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn unknown_tool_is_error() {
    let (dir, u, _root, _child) = seed_vault("unknown");
    let r = call_tool("nope", None, &u);
    assert!(r.is_error);
    drop(u);
    let _ = std::fs::remove_dir_all(&dir);
  }
}
