//! Vault-bound universe.db — Wave A/B (Turn-first, parent_id tree, edges).

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const SCHEMA_VERSION: i64 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InquiryNodeDto {
  pub id: String,
  pub title: String,
  pub parent_id: Option<String>,
  pub kind: String,
  pub unread: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub status: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub question: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnDto {
  pub id: String,
  pub title: String,
  pub collapsed: bool,
  pub user: String,
  pub ai_html: String,
  pub think: String,
  pub think_open: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSpanDto {
  pub turn_id: String,
  pub text: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub mark_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub start: Option<i64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub end: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeDto {
  pub id: String,
  pub kind: String,
  pub from_card_id: String,
  pub to_card_id: String,
  pub source: SourceSpanDto,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub why: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub actor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshotDto {
  pub source: String,
  pub nodes: Vec<InquiryNodeDto>,
  pub turns_by_card_id: std::collections::BTreeMap<String, Vec<TurnDto>>,
  pub focus_id: String,
  #[serde(default, skip_serializing_if = "Vec::is_empty")]
  pub edges: Vec<EdgeDto>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnInquiryArgs {
  pub kind: String,
  pub from_card_id: String,
  pub source: SourceSpanDto,
  pub why: Option<String>,
  pub actor: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenUniverseResult {
  pub ok: bool,
  pub path: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub snapshot: Option<WorkspaceSnapshotDto>,
}

pub struct Universe {
  pub vault_path: PathBuf,
  conn: Connection,
}

fn now_ms() -> u128 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis())
    .unwrap_or(0)
}

fn new_id(prefix: &str) -> String {
  use std::sync::atomic::{AtomicU64, Ordering};
  static SEQ: AtomicU64 = AtomicU64::new(0);
  let n = SEQ.fetch_add(1, Ordering::Relaxed);
  format!("{prefix}_{}_{n}", now_ms())
}

fn soit_dir(vault: &Path) -> PathBuf {
  vault.join(".soit")
}

fn db_path(vault: &Path) -> PathBuf {
  soit_dir(vault).join("universe.db")
}

impl Universe {
  pub fn open(vault: &Path) -> Result<Self, String> {
    if !vault.exists() {
      return Err("path does not exist".into());
    }
    if !vault.is_dir() {
      return Err("path is not a directory".into());
    }
    let soit = soit_dir(vault);
    std::fs::create_dir_all(&soit).map_err(|e| format!("create .soit: {e}"))?;
    let path = db_path(vault);
    let conn = Connection::open(&path).map_err(|e| format!("open db: {e}"))?;
    conn
      .execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
      .map_err(|e| format!("pragma: {e}"))?;
    let mut u = Self {
      vault_path: vault.to_path_buf(),
      conn,
    };
    u.migrate()?;
    Ok(u)
  }

  fn migrate(&mut self) -> Result<(), String> {
    self
      .conn
      .execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS cards (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          parent_id TEXT,
          kind TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          question TEXT,
          stuck TEXT,
          next_step TEXT,
          unread INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS turns (
          id TEXT PRIMARY KEY NOT NULL,
          card_id TEXT NOT NULL,
          title TEXT NOT NULL,
          collapsed INTEGER NOT NULL DEFAULT 0,
          user_text TEXT NOT NULL DEFAULT '',
          ai_html TEXT NOT NULL DEFAULT '',
          think TEXT NOT NULL DEFAULT '',
          think_open INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS edges (
          id TEXT PRIMARY KEY NOT NULL,
          kind TEXT NOT NULL,
          from_card_id TEXT NOT NULL,
          to_card_id TEXT NOT NULL,
          source_json TEXT,
          why TEXT,
          actor TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_turns_card ON turns(card_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_cards_parent ON cards(parent_id);
        CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_card_id);
        CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_card_id);
        "#,
      )
      .map_err(|e| format!("migrate: {e}"))?;

    // Pre-B DBs may lack actor column on edges
    let has_actor = self.edge_has_column("actor")?;
    if !has_actor {
      self
        .conn
        .execute("ALTER TABLE edges ADD COLUMN actor TEXT", [])
        .map_err(|e| format!("alter edges.actor: {e}"))?;
    }

    let ver: Option<String> = self
      .conn
      .query_row(
        "SELECT value FROM meta WHERE key = 'schema_version'",
        [],
        |r| r.get(0),
      )
      .optional()
      .map_err(|e| format!("read schema_version: {e}"))?;

    if ver.is_none() {
      self
        .conn
        .execute(
          "INSERT INTO meta (key, value) VALUES ('schema_version', ?1)",
          params![SCHEMA_VERSION.to_string()],
        )
        .map_err(|e| format!("insert schema_version: {e}"))?;
    }
    Ok(())
  }

  fn edge_has_column(&self, name: &str) -> Result<bool, String> {
    let mut stmt = self
      .conn
      .prepare("PRAGMA table_info(edges)")
      .map_err(|e| format!("pragma table_info: {e}"))?;
    let cols = stmt
      .query_map([], |row| row.get::<_, String>(1))
      .map_err(|e| format!("table_info rows: {e}"))?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|e| format!("table_info: {e}"))?;
    Ok(cols.iter().any(|c| c == name))
  }

  fn list_edges(&self) -> Result<Vec<EdgeDto>, String> {
    let mut stmt = self
      .conn
      .prepare(
        "SELECT id, kind, from_card_id, to_card_id, source_json, why, actor
         FROM edges ORDER BY created_at ASC, id ASC",
      )
      .map_err(|e| format!("prepare edges: {e}"))?;

    let rows = stmt
      .query_map([], |row| {
        let source_json: Option<String> = row.get(4)?;
        let source = parse_source_span(source_json.as_deref());
        Ok(EdgeDto {
          id: row.get(0)?,
          kind: row.get(1)?,
          from_card_id: row.get(2)?,
          to_card_id: row.get(3)?,
          source,
          why: row.get(5)?,
          actor: row.get(6)?,
        })
      })
      .map_err(|e| format!("query edges: {e}"))?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|e| format!("edges row: {e}"))?;
    Ok(rows)
  }

  pub fn snapshot(&self) -> Result<WorkspaceSnapshotDto, String> {
    let mut stmt = self
      .conn
      .prepare(
        "SELECT id, title, parent_id, kind, unread, status, question
         FROM cards ORDER BY created_at ASC, id ASC",
      )
      .map_err(|e| format!("prepare cards: {e}"))?;

    let nodes: Vec<InquiryNodeDto> = stmt
      .query_map([], |row| {
        let unread_i: i64 = row.get(4)?;
        Ok(InquiryNodeDto {
          id: row.get(0)?,
          title: row.get(1)?,
          parent_id: row.get(2)?,
          kind: row.get(3)?,
          unread: unread_i != 0,
          status: row.get(5)?,
          question: row.get(6)?,
        })
      })
      .map_err(|e| format!("query cards: {e}"))?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|e| format!("cards row: {e}"))?;

    let mut turns_by_card_id = std::collections::BTreeMap::new();
    let mut tstmt = self
      .conn
      .prepare(
        "SELECT id, card_id, title, collapsed, user_text, ai_html, think, think_open
         FROM turns ORDER BY sort_order ASC, created_at ASC, id ASC",
      )
      .map_err(|e| format!("prepare turns: {e}"))?;

    let turn_rows = tstmt
      .query_map([], |row| {
        let collapsed_i: i64 = row.get(3)?;
        let think_open_i: i64 = row.get(7)?;
        Ok((
          row.get::<_, String>(1)?,
          TurnDto {
            id: row.get(0)?,
            title: row.get(2)?,
            collapsed: collapsed_i != 0,
            user: row.get(4)?,
            ai_html: row.get(5)?,
            think: row.get(6)?,
            think_open: think_open_i != 0,
          },
        ))
      })
      .map_err(|e| format!("query turns: {e}"))?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|e| format!("turns row: {e}"))?;

    for (card_id, turn) in turn_rows {
      turns_by_card_id
        .entry(card_id)
        .or_insert_with(Vec::new)
        .push(turn);
    }

    let edges = self.list_edges()?;

    let focus_id = nodes
      .iter()
      .find(|n| n.parent_id.is_none())
      .map(|n| n.id.clone())
      .or_else(|| nodes.first().map(|n| n.id.clone()))
      .unwrap_or_default();

    let source = if nodes.is_empty() {
      "empty"
    } else {
      "universe"
    };

    Ok(WorkspaceSnapshotDto {
      source: source.into(),
      nodes,
      turns_by_card_id,
      focus_id,
      edges,
    })
  }

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

    self
      .conn
      .execute(
        "INSERT INTO cards (id, title, parent_id, kind, status, question, stuck, next_step, unread, created_at, updated_at)
         VALUES (?1, ?2, NULL, 'root', 'active', ?3, NULL, NULL, 0, ?4, ?4)",
        params![card_id, title, q, ts],
      )
      .map_err(|e| format!("insert card: {e}"))?;

    let turn_id = new_id("t");
    let user_text = q.unwrap_or("开始这条探究。");
    self
      .conn
      .execute(
        "INSERT INTO turns (id, card_id, title, collapsed, user_text, ai_html, think, think_open, sort_order, created_at)
         VALUES (?1, ?2, ?3, 0, ?4, ?5, '', 0, 0, ?6)",
        params![
          turn_id,
          card_id,
          "开场",
          user_text,
          "根探究已写入本库宇宙。对话与分叉将落在这棵树上（Wave A：持久化根卡；深挖/发送仍可先走前端内存）。",
          ts
        ],
      )
      .map_err(|e| format!("insert turn: {e}"))?;

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

    self
      .conn
      .execute(
        "INSERT INTO cards (id, title, parent_id, kind, status, question, stuck, next_step, unread, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'active', NULL, NULL, NULL, 1, ?5, ?5)",
        params![card_id, title, from, kind, ts],
      )
      .map_err(|e| format!("insert child card: {e}"))?;

    let source_json =
      serde_json::to_string(&args.source).map_err(|e| format!("serialize source: {e}"))?;

    self
      .conn
      .execute(
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
      let user_text = format!("从「{label}」往下：它具体指什么？");
      let ai_html = format!("这是对「{label}」的深挖卡。（host）");
      self
        .conn
        .execute(
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

    let mut snap = self.snapshot()?;
    snap.focus_id = card_id;
    Ok(snap)
  }
}

fn parse_source_span(raw: Option<&str>) -> SourceSpanDto {
  if let Some(s) = raw {
    if let Ok(span) = serde_json::from_str::<SourceSpanDto>(s) {
      return span;
    }
  }
  SourceSpanDto {
    turn_id: String::new(),
    text: String::new(),
    mark_id: None,
    start: None,
    end: None,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;

  #[test]
  fn open_empty_then_create_root_persists() {
    let dir = std::env::temp_dir().join(format!("soit_universe_test_{}", now_ms()));
    fs::create_dir_all(&dir).unwrap();

    {
      let mut u = Universe::open(&dir).expect("open");
      let snap = u.snapshot().unwrap();
      assert_eq!(snap.source, "empty");
      assert!(snap.nodes.is_empty());

      let snap2 = u
        .create_root_inquiry("测试根", Some("什么是函子？"))
        .unwrap();
      assert_eq!(snap2.source, "universe");
      assert_eq!(snap2.nodes.len(), 1);
      assert_eq!(snap2.nodes[0].kind, "root");
      assert_eq!(snap2.nodes[0].title, "测试根");
      assert!(snap2.turns_by_card_id.contains_key(&snap2.nodes[0].id));
    }

    {
      let u = Universe::open(&dir).expect("reopen");
      let snap = u.snapshot().unwrap();
      assert_eq!(snap.source, "universe");
      assert_eq!(snap.nodes.len(), 1);
      assert_eq!(snap.nodes[0].title, "测试根");
      assert_eq!(
        snap.nodes[0].question.as_deref(),
        Some("什么是函子？")
      );
    }

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn spawn_inquiry_deepen_and_diverge() {
    let dir = std::env::temp_dir().join(format!("soit_spawn_test_{}", now_ms()));
    fs::create_dir_all(&dir).unwrap();

    let mut u = Universe::open(&dir).unwrap();
    let root = u.create_root_inquiry("根", None).unwrap();
    let root_id = root.nodes[0].id.clone();

    let deep = u
      .spawn_inquiry(&SpawnInquiryArgs {
        kind: "deepen".into(),
        from_card_id: root_id.clone(),
        source: SourceSpanDto {
          turn_id: "t_src".into(),
          text: "函子".into(),
          mark_id: Some("函子".into()),
          start: None,
          end: None,
        },
        why: Some("why".into()),
        actor: Some("user".into()),
      })
      .unwrap();

    assert_eq!(deep.nodes.len(), 2);
    let child = deep.nodes.iter().find(|n| n.id == deep.focus_id).unwrap();
    assert_eq!(child.kind, "deepen");
    assert_eq!(child.parent_id.as_deref(), Some(root_id.as_str()));
    assert_eq!(deep.edges.len(), 1);
    assert_eq!(deep.edges[0].kind, "deepen");
    assert_eq!(deep.edges[0].source.text, "函子");
    assert_eq!(deep.edges[0].source.mark_id.as_deref(), Some("函子"));
    assert!(deep.turns_by_card_id.get(&child.id).map(|t| !t.is_empty()).unwrap_or(false));

    let div = u
      .spawn_inquiry(&SpawnInquiryArgs {
        kind: "diverge".into(),
        from_card_id: root_id.clone(),
        source: SourceSpanDto {
          turn_id: "t_src".into(),
          text: "平行".into(),
          mark_id: None,
          start: None,
          end: None,
        },
        why: None,
        actor: Some("agent".into()),
      })
      .unwrap();

    let dchild = div.nodes.iter().find(|n| n.id == div.focus_id).unwrap();
    assert_eq!(dchild.kind, "diverge");
    let dturns = div.turns_by_card_id.get(&dchild.id);
    assert!(dturns.map(|t| t.is_empty()).unwrap_or(true));
    assert_eq!(div.edges.len(), 2);
    let de = div.edges.iter().find(|e| e.to_card_id == dchild.id).unwrap();
    assert_eq!(de.actor.as_deref(), Some("agent"));

    // reopen persists edges
    drop(u);
    let u2 = Universe::open(&dir).unwrap();
    let snap = u2.snapshot().unwrap();
    assert_eq!(snap.edges.len(), 2);
    assert_eq!(snap.nodes.len(), 3);

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn open_rejects_missing_path() {
    let err = Universe::open(Path::new(
      "Z:\\soit-no-such-vault-xyz-should-not-exist",
    ));
    assert!(err.is_err());
  }
}
