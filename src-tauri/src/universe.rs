//! Vault-bound universe.db — Wave A (Turn-first, parent_id tree).

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
pub struct WorkspaceSnapshotDto {
  pub source: String,
  pub nodes: Vec<InquiryNodeDto>,
  pub turns_by_card_id: std::collections::BTreeMap<String, Vec<TurnDto>>,
  pub focus_id: String,
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
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_turns_card ON turns(card_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_cards_parent ON cards(parent_id);
        "#,
      )
      .map_err(|e| format!("migrate: {e}"))?;

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
  fn open_rejects_missing_path() {
    let err = Universe::open(Path::new(
      "Z:\\soit-no-such-vault-xyz-should-not-exist",
    ));
    assert!(err.is_err());
  }
}
