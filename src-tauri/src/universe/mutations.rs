//! Write path: root / spawn / turn / card mutations (immediate transactions).

use super::dto::{
  AppendTurnResult, MutationResult, SpawnInquiryArgs, TurnDto, WorkspaceSnapshotDto,
};
use super::ids::{escape_html, new_id, now_ms};
use super::Universe;
use rusqlite::{params, OptionalExtension};

impl Universe {
  pub fn create_root_inquiry(
    &mut self,
    title: &str,
    question: Option<&str>,
  ) -> Result<WorkspaceSnapshotDto, String> {
    let title = title.trim();
    if title.is_empty() {
      return Err("title is required".into());
    }
    let card_id = new_id("c");
    let ts = now_ms().to_string();
    let q = question.map(|s| s.trim()).filter(|s| !s.is_empty());

    let tx = self
      .conn
      .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
      .map_err(|e| format!("begin transaction: {e}"))?;

    tx.execute(
      "INSERT INTO cards (id, title, parent_id, kind, status, question, stuck, next_step, unread, created_at, updated_at)
       VALUES (?1, ?2, NULL, 'root', 'active', ?3, NULL, NULL, 0, ?4, ?4)",
      params![card_id, title, q, ts],
    )
    .map_err(|e| format!("insert card: {e}"))?;

    let turn_id = new_id("t");
    let user_text = q.unwrap_or("开始这条探究。");
    tx.execute(
      "INSERT INTO turns (id, card_id, title, collapsed, user_text, ai_html, think, think_open, sort_order, created_at)
       VALUES (?1, ?2, ?3, 0, ?4, ?5, '', 0, 0, ?6)",
      params![
        turn_id,
        card_id,
        "开场",
        user_text,
        "根探究已写入本库宇宙。对话与分叉将落在这棵树上。",
        ts
      ],
    )
    .map_err(|e| format!("insert turn: {e}"))?;

    Self::set_meta_tx(&tx, "last_focus_id", &card_id)?;

    tx.commit().map_err(|e| format!("commit: {e}"))?;

    self.snapshot()
  }

  /// Spawn deepen/diverge child + edge (+ optional deepen seed turn). Host ids.
  pub fn spawn_inquiry(&mut self, args: &SpawnInquiryArgs) -> Result<WorkspaceSnapshotDto, String> {
    let kind = args.kind.trim();
    if kind != "deepen" && kind != "diverge" {
      return Err(format!("invalid kind: {kind}"));
    }
    let from = args.from_card_id.trim();
    if from.is_empty() {
      return Err("fromCardId is required".into());
    }

    let parent_exists: bool = self
      .conn
      .query_row(
        "SELECT 1 FROM cards WHERE id = ?1",
        params![from],
        |_| Ok(true),
      )
      .optional()
      .map_err(|e| format!("lookup parent: {e}"))?
      .unwrap_or(false);
    if !parent_exists {
      return Err(format!("parent card not found: {from}"));
    }

    let label = {
      let t = args.source.text.trim();
      if t.is_empty() {
        "概念"
      } else {
        t
      }
    };
    let title_prefix = if kind == "deepen" { "深挖 · " } else { "发散 · " };
    let short: String = label.chars().take(12).collect();
    let title = format!("{title_prefix}{short}");

    let card_id = new_id(if kind == "deepen" { "d" } else { "v" });
    let edge_id = new_id("e");
    let ts = now_ms().to_string();

    let source_json =
      serde_json::to_string(&args.source).map_err(|e| format!("serialize source: {e}"))?;

    let tx = self
      .conn
      .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
      .map_err(|e| format!("begin transaction: {e}"))?;

    tx.execute(
      "INSERT INTO cards (id, title, parent_id, kind, status, question, stuck, next_step, unread, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 'active', NULL, NULL, NULL, 1, ?5, ?5)",
      params![card_id, title, from, kind, ts],
    )
    .map_err(|e| format!("insert child card: {e}"))?;

    tx.execute(
      "INSERT INTO edges (id, kind, from_card_id, to_card_id, source_json, why, actor, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
      params![
        edge_id,
        kind,
        from,
        card_id,
        source_json,
        args.why.as_deref(),
        args.actor.as_deref(),
        ts
      ],
    )
    .map_err(|e| format!("insert edge: {e}"))?;

    if kind == "deepen" {
      let turn_id = new_id("t");
      let safe_label = escape_html(label);
      let user_text = format!("从「{safe_label}」往下：它具体指什么？");
      let ai_html = format!("这是对「{safe_label}」的深挖卡。（host）");
      tx.execute(
        "INSERT INTO turns (id, card_id, title, collapsed, user_text, ai_html, think, think_open, sort_order, created_at)
         VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6, 0, 0, ?7)",
        params![
          turn_id,
          card_id,
          "深挖开场",
          user_text,
          ai_html,
          "深挖：父状态 + 源跨度；不整段灌父 transcript。",
          ts
        ],
      )
      .map_err(|e| format!("insert deepen seed turn: {e}"))?;
    }

    Self::set_meta_tx(&tx, "last_focus_id", &card_id)?;

    tx.commit().map_err(|e| format!("commit: {e}"))?;

    self.snapshot()
  }

  /// Append a user turn; host generates `t_*` id and sort_order.
  pub fn append_turn(
    &mut self,
    card_id: &str,
    title: Option<&str>,
    user: &str,
    quote: Option<&str>,
  ) -> Result<AppendTurnResult, String> {
    let card_id = card_id.trim();
    if card_id.is_empty() {
      return Err("cardId is required".into());
    }
    let user_raw = user.trim();
    if user_raw.is_empty() {
      return Err("user is required".into());
    }

    let card_exists: bool = self
      .conn
      .query_row(
        "SELECT 1 FROM cards WHERE id = ?1",
        params![card_id],
        |_| Ok(true),
      )
      .optional()
      .map_err(|e| format!("lookup card: {e}"))?
      .unwrap_or(false);
    if !card_exists {
      return Err(format!("card not found: {card_id}"));
    }

    let user_text = match quote.map(str::trim).filter(|s| !s.is_empty()) {
      Some(q) => format!("> {q}\n\n{user_raw}"),
      None => user_raw.to_string(),
    };
    let turn_title = title
      .map(str::trim)
      .filter(|s| !s.is_empty())
      .unwrap_or("对话")
      .to_string();

    let turn_id = new_id("t");
    let ts = now_ms().to_string();

    let tx = self
      .conn
      .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
      .map_err(|e| format!("begin transaction: {e}"))?;

    let next_order: i64 = tx
      .query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM turns WHERE card_id = ?1",
        params![card_id],
        |r| r.get(0),
      )
      .map_err(|e| format!("max sort_order: {e}"))?;

    tx.execute(
      "INSERT INTO turns (id, card_id, title, collapsed, user_text, ai_html, think, think_open, sort_order, created_at)
       VALUES (?1, ?2, ?3, 0, ?4, '', '', 0, ?5, ?6)",
      params![turn_id, card_id, turn_title, user_text, next_order, ts],
    )
    .map_err(|e| format!("insert turn: {e}"))?;

    tx.execute(
      "UPDATE cards SET updated_at = ?1 WHERE id = ?2",
      params![ts, card_id],
    )
    .map_err(|e| format!("touch card: {e}"))?;

    Self::set_meta_tx(&tx, "last_focus_id", card_id)?;

    tx.commit().map_err(|e| format!("commit: {e}"))?;

    let turn = TurnDto {
      id: turn_id,
      title: turn_title,
      collapsed: false,
      user: user_text,
      ai_html: String::new(),
      think: String::new(),
      think_open: false,
      starred: false,
      process: vec![],
      created_at: ts,
    };
    let snapshot = self.snapshot()?;
    Ok(AppendTurnResult { turn, snapshot })
  }

  /// Patch provided turn fields only.
  pub fn update_turn(
    &mut self,
    card_id: &str,
    turn_id: &str,
    ai_html: Option<&str>,
    think: Option<&str>,
    think_open: Option<bool>,
    collapsed: Option<bool>,
    title: Option<&str>,
    user: Option<&str>,
    process_json: Option<&str>,
  ) -> Result<MutationResult, String> {
    let card_id = card_id.trim();
    let turn_id = turn_id.trim();
    if card_id.is_empty() || turn_id.is_empty() {
      return Err("cardId and turnId are required".into());
    }

    let exists: bool = self
      .conn
      .query_row(
        "SELECT 1 FROM turns WHERE id = ?1 AND card_id = ?2",
        params![turn_id, card_id],
        |_| Ok(true),
      )
      .optional()
      .map_err(|e| format!("lookup turn: {e}"))?
      .unwrap_or(false);
    if !exists {
      return Err(format!("turn not found: {turn_id} on card {card_id}"));
    }

    let tx = self
      .conn
      .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
      .map_err(|e| format!("begin transaction: {e}"))?;

    if let Some(v) = ai_html {
      tx.execute(
        "UPDATE turns SET ai_html = ?1 WHERE id = ?2 AND card_id = ?3",
        params![v, turn_id, card_id],
      )
      .map_err(|e| format!("update ai_html: {e}"))?;
    }
    if let Some(v) = think {
      tx.execute(
        "UPDATE turns SET think = ?1 WHERE id = ?2 AND card_id = ?3",
        params![v, turn_id, card_id],
      )
      .map_err(|e| format!("update think: {e}"))?;
    }
    if let Some(v) = think_open {
      tx.execute(
        "UPDATE turns SET think_open = ?1 WHERE id = ?2 AND card_id = ?3",
        params![if v { 1 } else { 0 }, turn_id, card_id],
      )
      .map_err(|e| format!("update think_open: {e}"))?;
    }
    if let Some(v) = collapsed {
      tx.execute(
        "UPDATE turns SET collapsed = ?1 WHERE id = ?2 AND card_id = ?3",
        params![if v { 1 } else { 0 }, turn_id, card_id],
      )
      .map_err(|e| format!("update collapsed: {e}"))?;
    }
    if let Some(v) = title {
      tx.execute(
        "UPDATE turns SET title = ?1 WHERE id = ?2 AND card_id = ?3",
        params![v, turn_id, card_id],
      )
      .map_err(|e| format!("update title: {e}"))?;
    }
    if let Some(v) = user {
      tx.execute(
        "UPDATE turns SET user_text = ?1 WHERE id = ?2 AND card_id = ?3",
        params![v, turn_id, card_id],
      )
      .map_err(|e| format!("update user: {e}"))?;
    }
    if let Some(v) = process_json {
      let normalized = if v.trim().is_empty() {
        "[]".to_string()
      } else {
        // Validate JSON array
        let parsed: serde_json::Value =
          serde_json::from_str(v).map_err(|e| format!("process_json: {e}"))?;
        if !parsed.is_array() {
          return Err("process_json must be a JSON array".into());
        }
        parsed.to_string()
      };
      tx.execute(
        "UPDATE turns SET process_json = ?1 WHERE id = ?2 AND card_id = ?3",
        params![normalized, turn_id, card_id],
      )
      .map_err(|e| format!("update process_json: {e}"))?;
    }

    let ts = now_ms().to_string();
    tx.execute(
      "UPDATE cards SET updated_at = ?1 WHERE id = ?2",
      params![ts, card_id],
    )
    .map_err(|e| format!("touch card: {e}"))?;

    tx.commit().map_err(|e| format!("commit: {e}"))?;

    Ok(MutationResult {
      ok: true,
      snapshot: self.snapshot()?,
    })
  }

  /// PEL-166 — star / unstar a turn (catalog, not 活线).
  pub fn set_turn_starred(
    &mut self,
    card_id: &str,
    turn_id: &str,
    starred: bool,
  ) -> Result<MutationResult, String> {
    let card_id = card_id.trim();
    let turn_id = turn_id.trim();
    if card_id.is_empty() || turn_id.is_empty() {
      return Err("cardId and turnId are required".into());
    }

    let tx = self
      .conn
      .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
      .map_err(|e| format!("begin transaction: {e}"))?;

    let n = tx
      .execute(
        "UPDATE turns SET starred = ?1 WHERE id = ?2 AND card_id = ?3",
        params![if starred { 1 } else { 0 }, turn_id, card_id],
      )
      .map_err(|e| format!("set starred: {e}"))?;
    if n == 0 {
      return Err(format!("turn not found: {turn_id}"));
    }

    tx.commit().map_err(|e| format!("commit: {e}"))?;
    Ok(MutationResult {
      ok: true,
      snapshot: self.snapshot()?,
    })
  }

  /// Hard-delete one inquiry and its descendant subtree (cards + touching edges).
  /// Turns cascade via FK. Does not touch Obsidian markdown.
  pub fn delete_inquiry(&mut self, card_id: &str) -> Result<MutationResult, String> {
    let card_id = card_id.trim();
    if card_id.is_empty() {
      return Err("cardId is required".into());
    }

    let tx = self
      .conn
      .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
      .map_err(|e| format!("begin transaction: {e}"))?;

    let parent_id: Option<String> = match tx
      .query_row(
        "SELECT parent_id FROM cards WHERE id = ?1",
        params![card_id],
        |r| r.get::<_, Option<String>>(0),
      )
      .optional()
      .map_err(|e| format!("lookup card: {e}"))?
    {
      None => return Err(format!("card not found: {card_id}")),
      Some(p) => p,
    };

    let ids: Vec<String> = {
      let mut stmt = tx
        .prepare(
          "WITH RECURSIVE tree(id) AS (
             SELECT id FROM cards WHERE id = ?1
             UNION ALL
             SELECT c.id FROM cards c INNER JOIN tree t ON c.parent_id = t.id
           )
           SELECT id FROM tree",
        )
        .map_err(|e| format!("prepare subtree: {e}"))?;
      let rows = stmt
        .query_map(params![card_id], |r| r.get::<_, String>(0))
        .map_err(|e| format!("query subtree: {e}"))?;
      let mut out = Vec::new();
      for row in rows {
        out.push(row.map_err(|e| format!("subtree row: {e}"))?);
      }
      out
    };
    if ids.is_empty() {
      return Err(format!("card not found: {card_id}"));
    }

    let marks = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let edge_sql = format!(
      "DELETE FROM edges WHERE from_card_id IN ({m}) OR to_card_id IN ({m})",
      m = marks
    );
    let mut edge_args = ids.clone();
    edge_args.extend(ids.iter().cloned());
    tx.execute(&edge_sql, rusqlite::params_from_iter(edge_args))
      .map_err(|e| format!("delete edges: {e}"))?;

    let card_sql = format!("DELETE FROM cards WHERE id IN ({m})", m = marks);
    tx.execute(&card_sql, rusqlite::params_from_iter(ids.iter()))
      .map_err(|e| format!("delete cards: {e}"))?;

    let id_set: std::collections::HashSet<&str> =
      ids.iter().map(|s| s.as_str()).collect();
    let prev_focus = Self::get_meta_tx(&tx, "last_focus_id")?
      .filter(|id| !id.is_empty());
    let need_repoint = match &prev_focus {
      None => true,
      Some(f) => id_set.contains(f.as_str()),
    };
    let next_focus: String = if need_repoint {
      if let Some(p) = parent_id.filter(|p| !p.is_empty()) {
        p
      } else {
        tx.query_row(
          "SELECT id FROM cards ORDER BY created_at ASC, id ASC LIMIT 1",
          [],
          |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| format!("next focus: {e}"))?
        .unwrap_or_default()
      }
    } else {
      prev_focus.unwrap_or_default()
    };
    Self::set_meta_tx(&tx, "last_focus_id", &next_focus)?;

    tx.commit().map_err(|e| format!("commit: {e}"))?;

    Ok(MutationResult {
      ok: true,
      snapshot: self.snapshot()?,
    })
  }

  pub fn delete_turn(
    &mut self,
    card_id: &str,
    turn_id: &str,
  ) -> Result<MutationResult, String> {
    let card_id = card_id.trim();
    let turn_id = turn_id.trim();
    if card_id.is_empty() || turn_id.is_empty() {
      return Err("cardId and turnId are required".into());
    }

    let tx = self
      .conn
      .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
      .map_err(|e| format!("begin transaction: {e}"))?;

    let n = tx
      .execute(
        "DELETE FROM turns WHERE id = ?1 AND card_id = ?2",
        params![turn_id, card_id],
      )
      .map_err(|e| format!("delete turn: {e}"))?;
    if n == 0 {
      return Err(format!("turn not found: {turn_id} on card {card_id}"));
    }

    let ts = now_ms().to_string();
    tx.execute(
      "UPDATE cards SET updated_at = ?1 WHERE id = ?2",
      params![ts, card_id],
    )
    .map_err(|e| format!("touch card: {e}"))?;

    tx.commit().map_err(|e| format!("commit: {e}"))?;

    Ok(MutationResult {
      ok: true,
      snapshot: self.snapshot()?,
    })
  }

  /// Patch card fields; `next` maps to `next_step` column.
  pub fn update_card(
    &mut self,
    card_id: &str,
    title: Option<&str>,
    status: Option<&str>,
    question: Option<Option<&str>>,
    stuck: Option<Option<&str>>,
    next: Option<Option<&str>>,
    unread: Option<bool>,
  ) -> Result<MutationResult, String> {
    let card_id = card_id.trim();
    if card_id.is_empty() {
      return Err("cardId is required".into());
    }

    let exists: bool = self
      .conn
      .query_row(
        "SELECT 1 FROM cards WHERE id = ?1",
        params![card_id],
        |_| Ok(true),
      )
      .optional()
      .map_err(|e| format!("lookup card: {e}"))?
      .unwrap_or(false);
    if !exists {
      return Err(format!("card not found: {card_id}"));
    }

    if let Some(s) = status {
      match s {
        "active" | "paused" | "done" | "stuck" => {}
        _ => return Err(format!("invalid status: {s}")),
      }
    }

    let tx = self
      .conn
      .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
      .map_err(|e| format!("begin transaction: {e}"))?;

    if let Some(v) = title {
      let v = v.trim();
      if v.is_empty() {
        return Err("title must not be empty".into());
      }
      tx.execute(
        "UPDATE cards SET title = ?1 WHERE id = ?2",
        params![v, card_id],
      )
      .map_err(|e| format!("update title: {e}"))?;
    }
    if let Some(v) = status {
      tx.execute(
        "UPDATE cards SET status = ?1 WHERE id = ?2",
        params![v, card_id],
      )
      .map_err(|e| format!("update status: {e}"))?;
    }
    if let Some(v) = question {
      tx.execute(
        "UPDATE cards SET question = ?1 WHERE id = ?2",
        params![v, card_id],
      )
      .map_err(|e| format!("update question: {e}"))?;
    }
    if let Some(v) = stuck {
      tx.execute(
        "UPDATE cards SET stuck = ?1 WHERE id = ?2",
        params![v, card_id],
      )
      .map_err(|e| format!("update stuck: {e}"))?;
    }
    if let Some(v) = next {
      tx.execute(
        "UPDATE cards SET next_step = ?1 WHERE id = ?2",
        params![v, card_id],
      )
      .map_err(|e| format!("update next: {e}"))?;
    }
    if let Some(v) = unread {
      tx.execute(
        "UPDATE cards SET unread = ?1 WHERE id = ?2",
        params![if v { 1 } else { 0 }, card_id],
      )
      .map_err(|e| format!("update unread: {e}"))?;
    }

    let ts = now_ms().to_string();
    tx.execute(
      "UPDATE cards SET updated_at = ?1 WHERE id = ?2",
      params![ts, card_id],
    )
    .map_err(|e| format!("touch card: {e}"))?;

    tx.commit().map_err(|e| format!("commit: {e}"))?;

    Ok(MutationResult {
      ok: true,
      snapshot: self.snapshot()?,
    })
  }
}
