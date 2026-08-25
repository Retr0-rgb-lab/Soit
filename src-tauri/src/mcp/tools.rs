//! Read-only MCP tool schemas + handlers over `Universe::snapshot()`.
//!
//! P0 loads the full snapshot once per call and filters in memory. No raw SQL,
//! no write tools. Read ergonomics (spec 2026-08-25-mcp-read-ergonomics):
//! `render=text|markdown|html` (default text) converts `ai_html` via
//! `mcp::clean`; `list_turns` paginates; `list_cards` carries turnCount /
//! updatedAt / sizeHint; `search_cards` can search turn text.

use serde_json::{json, Map, Value};

use crate::mcp::clean::{ai_html_to_clean, TextMode};
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

// ---- argument parsing -----------------------------------------------------

fn arg_str(args: Option<&Value>, key: &str) -> Option<String> {
  args
    .and_then(Value::as_object)
    .and_then(|o| o.get(key))
    .and_then(Value::as_str)
    .map(String::from)
}

fn arg_bool(args: Option<&Value>, key: &str, default: bool) -> bool {
  args
    .and_then(Value::as_object)
    .and_then(|o| o.get(key))
    .and_then(Value::as_bool)
    .unwrap_or(default)
}

fn arg_u64(args: Option<&Value>, key: &str, default: u64, min: u64, max: u64) -> u64 {
  args
    .and_then(Value::as_object)
    .and_then(|o| o.get(key))
    .and_then(Value::as_u64)
    .unwrap_or(default)
    .clamp(min, max)
}

fn arg_render(args: Option<&Value>) -> &'static str {
  match arg_str(args, "render").as_deref() {
    Some("html") => "html",
    Some("markdown") => "markdown",
    _ => "text",
  }
}

// ---- value builders -------------------------------------------------------

fn node_value(node: &InquiryNodeDto) -> Value {
  serde_json::to_value(node).unwrap_or(Value::Null)
}

/// `think` / `process` are raw text / JSON stored verbatim — they must NOT go
/// through `ai_html_to_clean`. Only `ai_html` is converted.
fn turn_mcp_value(
  turn: &TurnDto,
  render: &str,
  include_think: bool,
  include_process: bool,
) -> Value {
  let mut obj = Map::new();
  obj.insert("id".into(), json!(turn.id));
  obj.insert("title".into(), json!(turn.title));
  obj.insert("collapsed".into(), json!(turn.collapsed));
  obj.insert("user".into(), json!(turn.user));
  match render {
    "html" => {
      obj.insert("aiHtml".into(), json!(turn.ai_html));
    }
    "markdown" => {
      obj.insert(
        "aiMarkdown".into(),
        json!(ai_html_to_clean(&turn.ai_html, TextMode::Markdown)),
      );
    }
    _ => {
      obj.insert(
        "aiText".into(),
        json!(ai_html_to_clean(&turn.ai_html, TextMode::Text)),
      );
    }
  }
  obj.insert("createdAt".into(), json!(turn.created_at));
  obj.insert("starred".into(), json!(turn.starred));
  if include_think {
    obj.insert("think".into(), json!(turn.think));
    obj.insert("thinkOpen".into(), json!(turn.think_open));
  }
  if include_process {
    obj.insert("process".into(), json!(turn.process));
  }
  Value::Object(obj)
}

fn card_meta_value(node: &InquiryNodeDto, turns: &[TurnDto]) -> Value {
  let size_hint: usize = turns
    .iter()
    .map(|t| t.ai_html.len() + t.user.len() + t.think.len())
    .sum();
  let mut v = node_value(node);
  if let Some(obj) = v.as_object_mut() {
    obj.insert("turnCount".into(), json!(turns.len()));
    obj.insert("sizeHint".into(), json!(size_hint));
  }
  v
}

fn turns_of<'a>(snapshot: &'a WorkspaceSnapshotDto, card_id: &str) -> &'a [TurnDto] {
  snapshot
    .turns_by_card_id
    .get(card_id)
    .map(Vec::as_slice)
    .unwrap_or(&[])
}

/// Byte-position snippet with char-boundary-safe `…` markers (±radius chars).
fn snippet_around(hay: &str, byte_pos: usize, needle_len: usize, radius: usize) -> String {
  let start = hay[..byte_pos]
    .char_indices()
    .rev()
    .nth(radius)
    .map(|(i, _)| i)
    .unwrap_or(0);
  let end = hay[byte_pos + needle_len..]
    .char_indices()
    .nth(radius)
    .map(|(i, _)| byte_pos + needle_len + i)
    .unwrap_or(hay.len());
  let mut s = String::new();
  if start > 0 {
    s.push('…');
  }
  s.push_str(&hay[start..end]);
  if end < hay.len() {
    s.push('…');
  }
  s
}

fn tool_def(name: &str, description: &str, input_schema: Value) -> Value {
  json!({ "name": name, "description": description, "inputSchema": input_schema })
}

fn render_prop() -> Value {
  json!({
    "type": "string",
    "enum": ["text", "markdown", "html"],
    "description": "Output format for the turn's assistant content. text=clean text with LaTeX restored (default, no KaTeX SVG). markdown=semantic markdown. html=raw rendered HTML (legacy)."
  })
}

pub fn tool_definitions() -> Vec<Value> {
  vec![
    tool_def(
      "list_cards",
      "List all inquiry cards in the Soit universe (optionally filtered by status/kind). Each card carries turnCount, updatedAt, and sizeHint (bytes).",
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
        "properties": {
          "cardId": { "type": "string" },
          "render": render_prop()
        },
        "required": ["cardId"],
        "additionalProperties": false
      }),
    ),
    tool_def(
      "list_turns",
      "List the conversation turns of one inquiry card, paginated. Returns { total, offset, limit, turns }. By default think/process are omitted.",
      json!({
        "type": "object",
        "properties": {
          "cardId": { "type": "string" },
          "render": render_prop(),
          "offset": { "type": "integer", "minimum": 0 },
          "limit": { "type": "integer", "minimum": 1, "maximum": 100 },
          "includeThink": { "type": "boolean" },
          "includeProcess": { "type": "boolean" }
        },
        "required": ["cardId"],
        "additionalProperties": false
      }),
    ),
    tool_def(
      "read_turn",
      "Read a single conversation turn on an inquiry card (full detail: think/process always included).",
      json!({
        "type": "object",
        "properties": {
          "cardId": { "type": "string" },
          "turnId": { "type": "string" },
          "render": render_prop()
        },
        "required": ["cardId", "turnId"],
        "additionalProperties": false
      }),
    ),
    tool_def(
      "search_cards",
      "Case-insensitive substring search over card title/question/stuck/next and (optionally) turn text. Hit cards carry matchedIn and (for turn hits) matchSnippet.",
      json!({
        "type": "object",
        "properties": {
          "query": { "type": "string" },
          "searchTurns": { "type": "boolean" },
          "limit": { "type": "integer", "minimum": 1, "maximum": 50 }
        },
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
    .map(|n| {
      let turns = turns_of(snapshot, &n.id);
      card_meta_value(n, turns)
    })
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
  let render = arg_render(args);
  let turns = turns_of(snapshot, &card_id);
  let mut v = card_meta_value(node, turns);
  let arr: Vec<Value> = turns
    .iter()
    .map(|t| turn_mcp_value(t, render, true, true))
    .collect();
  if let Some(obj) = v.as_object_mut() {
    obj.insert("turns".into(), Value::Array(arr));
  }
  ok_text(v)
}

fn list_turns(snapshot: &WorkspaceSnapshotDto, args: Option<&Value>) -> ToolResult {
  let Some(card_id) = arg_str(args, "cardId") else {
    return error_text("missing required parameter: cardId");
  };
  if !snapshot.nodes.iter().any(|n| n.id == card_id) {
    return error_text(&format!("card not found: {card_id}"));
  }
  let render = arg_render(args);
  let include_think = arg_bool(args, "includeThink", false);
  let include_process = arg_bool(args, "includeProcess", false);
  let offset = arg_u64(args, "offset", 0, 0, u64::MAX);
  let limit = arg_u64(args, "limit", 50, 1, 100);
  let turns = turns_of(snapshot, &card_id);
  let total = turns.len() as u64;
  let start = offset.min(total) as usize;
  let end = (offset + limit).min(total) as usize;
  let page: Vec<Value> = turns[start..end]
    .iter()
    .map(|t| turn_mcp_value(t, render, include_think, include_process))
    .collect();
  ok_text(json!({ "total": total, "offset": offset, "limit": limit, "turns": page }))
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
  let render = arg_render(args);
  // Single turn: full detail (think/process always included).
  ok_text(turn_mcp_value(turn, render, true, true))
}

fn search_cards(snapshot: &WorkspaceSnapshotDto, args: Option<&Value>) -> ToolResult {
  let Some(query) = arg_str(args, "query") else {
    return error_text("missing required parameter: query");
  };
  let search_turns = arg_bool(args, "searchTurns", true);
  let limit = arg_u64(args, "limit", 20, 1, 50);
  let needle = query.to_lowercase();
  let mut cards: Vec<Value> = Vec::new();

  for node in &snapshot.nodes {
    let turns = turns_of(snapshot, &node.id);
    let title_l = node.title.to_lowercase();
    let question_l = node.question.as_deref().unwrap_or("").to_lowercase();
    let stuck_l = node.stuck.as_deref().unwrap_or("").to_lowercase();
    let next_l = node.next.as_deref().unwrap_or("").to_lowercase();
    let card_hay = format!("{title_l} {question_l} {stuck_l} {next_l}");

    if card_hay.contains(&needle) {
      let matched_in = if title_l.contains(&needle) {
        "title"
      } else if question_l.contains(&needle) {
        "question"
      } else if stuck_l.contains(&needle) {
        "stuck"
      } else {
        "next"
      };
      let mut v = card_meta_value(node, turns);
      if let Some(obj) = v.as_object_mut() {
        obj.insert("matchedIn".into(), json!(matched_in));
      }
      cards.push(v);
    } else if search_turns {
      for t in turns {
        let clean = ai_html_to_clean(&t.ai_html, TextMode::Text);
        let hay = format!("{} {}", t.user, clean).to_lowercase();
        if let Some(pos) = hay.find(&needle) {
          let snippet = snippet_around(&hay, pos, needle.len(), 40);
          let mut v = card_meta_value(node, turns);
          if let Some(obj) = v.as_object_mut() {
            obj.insert("matchedIn".into(), json!("turns"));
            obj.insert("matchSnippet".into(), json!(snippet));
          }
          cards.push(v);
          break;
        }
      }
    }

    if cards.len() as u64 >= limit {
      break;
    }
  }

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

  fn sample_turn() -> TurnDto {
    TurnDto {
      id: "t1".into(),
      title: "标题".into(),
      collapsed: false,
      user: "问".into(),
      ai_html: "<p>答 <span class=\"soit-math soit-math-inline\" data-tex=\"x&lt;y\">K</span></p>".into(),
      think: "思考过程".into(),
      think_open: true,
      starred: true,
      process: vec![json!({"kind": "think", "status": "ok"})],
      created_at: "2026-08-25T00:00:00Z".into(),
    }
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
  fn tool_definitions_expose_render_and_pagination() {
    let defs = tool_definitions();
    let list_turns = defs.iter().find(|t| t["name"] == "list_turns").unwrap();
    let props = &list_turns["inputSchema"]["properties"];
    for k in ["render", "offset", "limit", "includeThink", "includeProcess"] {
      assert!(props.get(k).is_some(), "missing {k}");
    }
    let search = defs.iter().find(|t| t["name"] == "search_cards").unwrap();
    for k in ["searchTurns", "limit"] {
      assert!(search["inputSchema"]["properties"].get(k).is_some(), "missing {k}");
    }
  }

  #[test]
  fn list_cards_and_filters() {
    let (dir, u, _root, _child) = seed_vault("list");
    let all = call_tool("list_cards", None, &u);
    assert!(!all.is_error);
    let cards = text_of(&all);
    assert_eq!(cards.as_array().unwrap().len(), 2);

    let filtered = call_tool("list_cards", Some(&json!({"kind": "deepen"})), &u);
    let cards = text_of(&filtered);
    assert_eq!(cards.as_array().unwrap().len(), 1);
    assert_eq!(cards[0]["kind"], "deepen");
    // metadata present
    assert!(cards[0].get("turnCount").is_some());
    assert!(cards[0].get("updatedAt").is_some());
    assert!(cards[0].get("sizeHint").is_some());
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
    let turns = v["turns"].as_array().unwrap();
    assert!(turns.len() >= 2);
    // default render=text
    assert!(turns[0].get("aiText").is_some());
    assert!(turns[0].get("aiHtml").is_none());

    let missing = call_tool("read_card", Some(&json!({"cardId": "nope"})), &u);
    assert!(missing.is_error);
    drop(u);
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn list_turns_pagination_shape() {
    let (dir, u, root_id, _child) = seed_vault("turns");
    let list = call_tool(
      "list_turns",
      Some(&json!({"cardId": root_id, "limit": 1, "offset": 0})),
      &u,
    );
    let v = text_of(&list);
    assert!(v.get("total").is_some());
    assert!(v["total"].as_u64().unwrap() >= 2);
    assert_eq!(v["limit"], 1);
    assert_eq!(v["offset"], 0);
    assert_eq!(v["turns"].as_array().unwrap().len(), 1);
    drop(u);
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn list_turns_offset_overflow_empty() {
    let (dir, u, root_id, _child) = seed_vault("overflow");
    let total = {
      let list = call_tool("list_turns", Some(&json!({"cardId": root_id})), &u);
      text_of(&list)["total"].as_u64().unwrap()
    };
    let list = call_tool(
      "list_turns",
      Some(&json!({"cardId": root_id, "offset": total + 10})),
      &u,
    );
    let v = text_of(&list);
    assert_eq!(v["total"], total);
    assert!(v["turns"].as_array().unwrap().is_empty());
    drop(u);
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn list_turns_default_omits_think_process() {
    let (dir, u, root_id, _child) = seed_vault("omit");
    let list = call_tool("list_turns", Some(&json!({"cardId": root_id})), &u);
    let turns = text_of(&list)["turns"].clone();
    let first = &turns.as_array().unwrap()[0];
    assert!(first.get("think").is_none());
    assert!(first.get("process").is_none());
    assert!(first.get("aiText").is_some());
    drop(u);
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn list_turns_include_think_shows_think() {
    let (dir, u, root_id, _child) = seed_vault("inclthink");
    let list = call_tool(
      "list_turns",
      Some(&json!({"cardId": root_id, "includeThink": true})),
      &u,
    );
    let turns = text_of(&list)["turns"].clone();
    let first = &turns.as_array().unwrap()[0];
    assert!(first.get("think").is_some());
    assert!(first.get("process").is_none());
    drop(u);
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn read_turn_full_detail() {
    let (dir, u, root_id, _child) = seed_vault("rt");
    let list = call_tool("list_turns", Some(&json!({"cardId": root_id})), &u);
    let first_id = text_of(&list)["turns"][0]["id"].as_str().unwrap().to_string();

    let one = call_tool(
      "read_turn",
      Some(&json!({"cardId": root_id, "turnId": first_id})),
      &u,
    );
    let v = text_of(&one);
    assert_eq!(v["id"], first_id);
    // full detail
    assert!(v.get("think").is_some());
    assert!(v.get("process").is_some());
    assert!(v.get("aiText").is_some());
    drop(u);
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn turn_value_text_and_markdown_modes() {
    let t = sample_turn();
    let v = turn_mcp_value(&t, "text", false, false);
    assert_eq!(v["aiText"].as_str().unwrap(), "答 $x<y$");
    assert!(v.get("aiHtml").is_none());
    assert!(v.get("think").is_none());
    assert!(v.get("process").is_none());
    assert_eq!(v["createdAt"], "2026-08-25T00:00:00Z");

    let m = turn_mcp_value(&t, "markdown", false, false);
    assert_eq!(m["aiMarkdown"].as_str().unwrap(), "答 $x<y$");
    assert!(m.get("aiText").is_none());
  }

  #[test]
  fn turn_value_html_matches_legacy_shape() {
    let t = sample_turn();
    let v = turn_mcp_value(&t, "html", true, true);
    assert_eq!(v["aiHtml"].as_str().unwrap(), t.ai_html);
    assert_eq!(v["think"].as_str().unwrap(), "思考过程");
    assert_eq!(v["thinkOpen"], true);
    assert_eq!(v["starred"], true);
    assert_eq!(v["process"].as_array().unwrap().len(), 1);
    assert!(v.get("aiText").is_none());
    assert!(v.get("aiMarkdown").is_none());
    // createdAt is the only added field vs legacy TurnDto serde output.
  }

  #[test]
  fn turn_value_include_flags_independent() {
    let t = sample_turn();
    let think_only = turn_mcp_value(&t, "text", true, false);
    assert!(think_only.get("think").is_some());
    assert!(think_only.get("process").is_none());

    let proc_only = turn_mcp_value(&t, "text", false, true);
    assert!(proc_only.get("think").is_none());
    assert!(proc_only.get("process").is_some());
  }

  #[test]
  fn arg_u64_clamps() {
    assert_eq!(arg_u64(Some(&json!({"limit": 1000})), "limit", 20, 1, 50), 50);
    assert_eq!(arg_u64(Some(&json!({"limit": 0})), "limit", 20, 1, 50), 1);
    assert_eq!(arg_u64(None, "limit", 20, 1, 50), 20);
  }

  #[test]
  fn arg_render_defaults_and_valid() {
    assert_eq!(arg_render(None), "text");
    assert_eq!(arg_render(Some(&json!({"render": "html"}))), "html");
    assert_eq!(arg_render(Some(&json!({"render": "markdown"}))), "markdown");
    assert_eq!(arg_render(Some(&json!({"render": "bogus"}))), "text");
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
  fn search_cards_turn_hit_returns_snippet() {
    let (dir, u, _root, _child) = seed_vault("searchturns");
    let r = call_tool(
      "search_cards",
      Some(&json!({"query": "用户追问", "searchTurns": true})),
      &u,
    );
    let cards = text_of(&r);
    let arr = cards.as_array().unwrap();
    assert!(!arr.is_empty());
    assert_eq!(arr[0]["matchedIn"], "turns");
    assert!(arr[0]["matchSnippet"].as_str().unwrap().contains("用户追问"));
    drop(u);
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn search_cards_turns_disabled() {
    let (dir, u, _root, _child) = seed_vault("searchoff");
    let r = call_tool(
      "search_cards",
      Some(&json!({"query": "用户追问", "searchTurns": false})),
      &u,
    );
    let cards = text_of(&r);
    assert!(cards.as_array().unwrap().is_empty());
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
