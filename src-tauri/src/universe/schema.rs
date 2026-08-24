//! DDL, schema_version gate, meta helpers.

use super::{Universe, SCHEMA_VERSION};
use rusqlite::{params, OptionalExtension};

impl Universe {
  pub(super) fn migrate(&mut self) -> Result<(), String> {
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
          parent_id TEXT REFERENCES cards(id),
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
          from_card_id TEXT NOT NULL REFERENCES cards(id),
          to_card_id TEXT NOT NULL REFERENCES cards(id),
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
    if !self.edge_has_column("actor")? {
      self
        .conn
        .execute("ALTER TABLE edges ADD COLUMN actor TEXT", [])
        .map_err(|e| format!("alter edges.actor: {e}"))?;
    }

    // PEL-166 — turn stars
    if !self.turns_has_column("starred")? {
      self
        .conn
        .execute(
          "ALTER TABLE turns ADD COLUMN starred INTEGER NOT NULL DEFAULT 0",
          [],
        )
        .map_err(|e| format!("alter turns.starred: {e}"))?;
    }

    // Inquiry tools — process timeline JSON (no SCHEMA_VERSION bump)
    if !self.turns_has_column("process_json")? {
      self
        .conn
        .execute(
          "ALTER TABLE turns ADD COLUMN process_json TEXT NOT NULL DEFAULT '[]'",
          [],
        )
        .map_err(|e| format!("alter turns.process_json: {e}"))?;
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

    match ver {
      None => {
        self
          .conn
          .execute(
            "INSERT INTO meta (key, value) VALUES ('schema_version', ?1)",
            params![SCHEMA_VERSION.to_string()],
          )
          .map_err(|e| format!("insert schema_version: {e}"))?;
      }
      Some(s) => {
        let v: i64 = s
          .parse()
          .map_err(|_| format!("invalid schema_version: {s}"))?;
        if v > SCHEMA_VERSION {
          return Err(format!(
            "database schema version {v} is newer than this app ({SCHEMA_VERSION}); please upgrade Soit"
          ));
        }
        if v < SCHEMA_VERSION {
          // Future stepwise migrations land here; then stamp current version.
          self.set_meta("schema_version", &SCHEMA_VERSION.to_string())?;
        }
      }
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

  fn turns_has_column(&self, name: &str) -> Result<bool, String> {
    let mut stmt = self
      .conn
      .prepare("PRAGMA table_info(turns)")
      .map_err(|e| format!("pragma table_info turns: {e}"))?;
    let cols = stmt
      .query_map([], |row| row.get::<_, String>(1))
      .map_err(|e| format!("table_info turns rows: {e}"))?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|e| format!("table_info turns: {e}"))?;
    Ok(cols.iter().any(|c| c == name))
  }

  pub(super) fn get_meta(&self, key: &str) -> Result<Option<String>, String> {
    self
      .conn
      .query_row(
        "SELECT value FROM meta WHERE key = ?1",
        params![key],
        |r| r.get(0),
      )
      .optional()
      .map_err(|e| format!("get meta {key}: {e}"))
  }

  pub(super) fn set_meta(&self, key: &str, value: &str) -> Result<(), String> {
    self
      .conn
      .execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
      )
      .map_err(|e| format!("set meta {key}: {e}"))?;
    Ok(())
  }

  /// Transaction-scoped meta read.
  pub(super) fn get_meta_tx(
    tx: &rusqlite::Transaction<'_>,
    key: &str,
  ) -> Result<Option<String>, String> {
    tx.query_row(
      "SELECT value FROM meta WHERE key = ?1",
      params![key],
      |r| r.get(0),
    )
    .optional()
    .map_err(|e| format!("get meta {key}: {e}"))
  }

  /// Transaction-scoped meta write (same UPSERT).
  pub(super) fn set_meta_tx(
    tx: &rusqlite::Transaction<'_>,
    key: &str,
    value: &str,
  ) -> Result<(), String> {
    tx.execute(
      "INSERT INTO meta (key, value) VALUES (?1, ?2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      params![key, value],
    )
    .map_err(|e| format!("set meta {key}: {e}"))?;
    Ok(())
  }
}
