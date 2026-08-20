//! Vault-bound universe.db — Turn-first, parent_id tree, edges.

mod dto;
mod ids;
mod mutations;
mod schema;
mod snapshot;

// Public host/IPC surface (may be unused inside this crate).
#[allow(unused_imports)]
pub use dto::{
  AppendTurnResult, EdgeDto, InquiryNodeDto, MutationResult, OpenUniverseResult, SourceSpanDto,
  SpawnInquiryArgs, TurnDto, WorkspaceSnapshotDto,
};

use rusqlite::Connection;
use std::path::{Path, PathBuf};

pub const SCHEMA_VERSION: i64 = 1;

pub struct Universe {
  pub vault_path: PathBuf,
  conn: Connection,
}

fn soit_dir(vault: &Path) -> PathBuf {
  vault.join(".soit")
}

fn db_path(vault: &Path) -> PathBuf {
  soit_dir(vault).join("universe.db")
}

impl Universe {
  /// Open vault-bound DB. Path must be absolute; stored path is canonical.
  pub fn open(vault: &Path) -> Result<Self, String> {
    if !vault.is_absolute() {
      return Err("path must be absolute".into());
    }
    if !vault.exists() {
      return Err("path does not exist".into());
    }
    if !vault.is_dir() {
      return Err("path is not a directory".into());
    }

    let canonical = dunce::canonicalize(vault)
      .map_err(|e| format!("canonicalize path: {e}"))?;

    let soit = soit_dir(&canonical);
    std::fs::create_dir_all(&soit).map_err(|e| format!("create .soit: {e}"))?;
    let path = db_path(&canonical);
    let conn = Connection::open(&path).map_err(|e| format!("open db: {e}"))?;
    conn
      .execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
      .map_err(|e| format!("pragma: {e}"))?;
    let mut u = Self {
      vault_path: canonical,
      conn,
    };
    u.migrate()?;
    Ok(u)
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::universe::dto::{SourceSpanDto, SpawnInquiryArgs};
  use crate::universe::ids::now_ms;
  use std::fs;
  use std::path::Path;

  fn temp_vault(label: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("soit_{label}_{}", now_ms()));
    fs::create_dir_all(&dir).unwrap();
    dir
  }

  #[test]
  fn open_empty_then_create_root_persists() {
    let dir = temp_vault("universe_test");

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
      let seed = &snap2.turns_by_card_id[&snap2.nodes[0].id][0];
      assert!(!seed.ai_html.contains("前端内存"));
    }

    {
      let u = Universe::open(&dir).expect("reopen");
      let snap = u.snapshot().unwrap();
      assert_eq!(snap.source, "universe");
      assert_eq!(snap.nodes.len(), 1);
      assert_eq!(snap.nodes[0].title, "测试根");
      assert_eq!(snap.nodes[0].question.as_deref(), Some("什么是函子？"));
    }

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn spawn_inquiry_deepen_and_diverge() {
    let dir = temp_vault("spawn_test");

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
    assert!(deep
      .turns_by_card_id
      .get(&child.id)
      .map(|t| !t.is_empty())
      .unwrap_or(false));
    assert_eq!(deep.focus_id, child.id);

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

    drop(u);
    let u2 = Universe::open(&dir).unwrap();
    let snap = u2.snapshot().unwrap();
    assert_eq!(snap.edges.len(), 2);
    assert_eq!(snap.nodes.len(), 3);
    assert_eq!(snap.focus_id, dchild.id);

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn open_rejects_missing_path() {
    let err = Universe::open(Path::new(
      "Z:\\soit-no-such-vault-xyz-should-not-exist",
    ));
    assert!(err.is_err());
  }

  #[test]
  fn open_rejects_relative_path() {
    let err = Universe::open(Path::new("relative/vault"));
    let msg = err.err().expect("relative path must err");
    assert!(
      msg.contains("absolute"),
      "expected absolute-path error, got: {msg}"
    );
  }

  #[test]
  fn open_rejects_schema_version_too_new() {
    let dir = temp_vault("schema_new");
    {
      let u = Universe::open(&dir).unwrap();
      u.conn
        .execute(
          "UPDATE meta SET value = '999' WHERE key = 'schema_version'",
          [],
        )
        .unwrap();
    }
    let err = Universe::open(&dir);
    let msg = err.err().expect("future schema must err");
    assert!(
      msg.contains("newer") || msg.contains("upgrade"),
      "got: {msg}"
    );
    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn append_turn_persists_across_reopen() {
    let dir = temp_vault("append_turn");
    let (card_id, turn_id, user_text) = {
      let mut u = Universe::open(&dir).unwrap();
      let root = u.create_root_inquiry("根", None).unwrap();
      let card_id = root.nodes[0].id.clone();
      let r = u
        .append_turn(&card_id, Some("第二轮"), "用户问题", Some("引用句"))
        .unwrap();
      assert!(r.turn.id.starts_with("t_"));
      assert_eq!(r.turn.user, "> 引用句\n\n用户问题");
      assert!(r.turn.ai_html.is_empty());
      assert!(r.snapshot.turns_by_card_id[&card_id]
        .iter()
        .any(|t| t.id == r.turn.id));
      (card_id, r.turn.id.clone(), r.turn.user.clone())
    };

    let u2 = Universe::open(&dir).unwrap();
    let snap = u2.snapshot().unwrap();
    let turns = snap.turns_by_card_id.get(&card_id).expect("turns");
    let t = turns.iter().find(|t| t.id == turn_id).expect("turn");
    assert_eq!(t.user, user_text);
    assert_eq!(t.title, "第二轮");

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn parent_turns_survive_spawn() {
    let dir = temp_vault("parent_turns_spawn");
    let mut u = Universe::open(&dir).unwrap();
    let root = u.create_root_inquiry("根", None).unwrap();
    let root_id = root.nodes[0].id.clone();
    let before = u
      .append_turn(&root_id, None, "父卡对话应保留", None)
      .unwrap();
    let parent_turn_id = before.turn.id.clone();
    let parent_count = before.snapshot.turns_by_card_id[&root_id].len();

    let _deep = u
      .spawn_inquiry(&SpawnInquiryArgs {
        kind: "deepen".into(),
        from_card_id: root_id.clone(),
        source: SourceSpanDto {
          turn_id: parent_turn_id.clone(),
          text: "词".into(),
          mark_id: None,
          start: None,
          end: None,
        },
        why: None,
        actor: None,
      })
      .unwrap();

    let after = u.snapshot().unwrap();
    let parent_turns = after.turns_by_card_id.get(&root_id).unwrap();
    assert_eq!(parent_turns.len(), parent_count);
    assert!(parent_turns.iter().any(|t| t.id == parent_turn_id));
    assert!(parent_turns.iter().any(|t| t.user == "父卡对话应保留"));

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn update_card_unread_persists() {
    let dir = temp_vault("unread");
    let card_id = {
      let mut u = Universe::open(&dir).unwrap();
      let root = u.create_root_inquiry("根", None).unwrap();
      let root_id = root.nodes[0].id.clone();
      let deep = u
        .spawn_inquiry(&SpawnInquiryArgs {
          kind: "deepen".into(),
          from_card_id: root_id,
          source: SourceSpanDto {
            turn_id: "t".into(),
            text: "x".into(),
            mark_id: None,
            start: None,
            end: None,
          },
          why: None,
          actor: None,
        })
        .unwrap();
      let child = deep.nodes.iter().find(|n| n.kind == "deepen").unwrap();
      assert!(child.unread);
      let child_id = child.id.clone();
      let r = u
        .update_card(&child_id, None, None, None, None, None, Some(false))
        .unwrap();
      assert!(r.ok);
      let n = r.snapshot.nodes.iter().find(|n| n.id == child_id).unwrap();
      assert!(!n.unread);
      child_id
    };

    let u2 = Universe::open(&dir).unwrap();
    let snap = u2.snapshot().unwrap();
    let n = snap.nodes.iter().find(|n| n.id == card_id).unwrap();
    assert!(!n.unread);

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn update_turn_and_delete_turn() {
    let dir = temp_vault("turn_mut");
    let mut u = Universe::open(&dir).unwrap();
    let root = u.create_root_inquiry("根", None).unwrap();
    let card_id = root.nodes[0].id.clone();
    let app = u.append_turn(&card_id, None, "hi", None).unwrap();
    let tid = app.turn.id.clone();

    let up = u
      .update_turn(
        &card_id,
        &tid,
        Some("<p>answer</p>"),
        Some("think"),
        Some(true),
        Some(true),
        None,
        None,
      )
      .unwrap();
    assert!(up.ok);
    let t = up.snapshot.turns_by_card_id[&card_id]
      .iter()
      .find(|t| t.id == tid)
      .unwrap();
    assert_eq!(t.ai_html, "<p>answer</p>");
    assert_eq!(t.think, "think");
    assert!(t.think_open);
    assert!(t.collapsed);

    let del = u.delete_turn(&card_id, &tid).unwrap();
    assert!(del.ok);
    assert!(!del.snapshot.turns_by_card_id[&card_id]
      .iter()
      .any(|t| t.id == tid));

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn update_card_stuck_next_in_snapshot() {
    let dir = temp_vault("stuck_next");
    let mut u = Universe::open(&dir).unwrap();
    let root = u.create_root_inquiry("根", None).unwrap();
    let id = root.nodes[0].id.clone();
    let r = u
      .update_card(
        &id,
        None,
        Some("stuck"),
        Some(Some("q?")),
        Some(Some("卡在定义")),
        Some(Some("查资料")),
        None,
      )
      .unwrap();
    let n = r.snapshot.nodes.iter().find(|n| n.id == id).unwrap();
    assert_eq!(n.status.as_deref(), Some("stuck"));
    assert_eq!(n.question.as_deref(), Some("q?"));
    assert_eq!(n.stuck.as_deref(), Some("卡在定义"));
    assert_eq!(n.next.as_deref(), Some("查资料"));

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn deepen_seed_escapes_html_in_label() {
    let dir = temp_vault("xss_test");

    let mut u = Universe::open(&dir).unwrap();
    let root = u.create_root_inquiry("根", None).unwrap();
    let root_id = root.nodes[0].id.clone();

    let deep = u
      .spawn_inquiry(&SpawnInquiryArgs {
        kind: "deepen".into(),
        from_card_id: root_id,
        source: SourceSpanDto {
          turn_id: "t_src".into(),
          text: "<img onerror=alert(1)>".into(),
          mark_id: None,
          start: None,
          end: None,
        },
        why: None,
        actor: None,
      })
      .unwrap();

    let child = deep.nodes.iter().find(|n| n.id == deep.focus_id).unwrap();
    let turns = deep.turns_by_card_id.get(&child.id).unwrap();
    assert!(!turns.is_empty());
    assert!(turns[0].ai_html.contains("&lt;img"));
    assert!(!turns[0].ai_html.contains("<img"));
    assert!(turns[0].user.contains("&lt;img"));

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn stores_canonical_vault_path() {
    let dir = temp_vault("canon");
    let u = Universe::open(&dir).unwrap();
    assert!(u.vault_path.is_absolute());
    let v: String = u
      .conn
      .query_row(
        "SELECT value FROM meta WHERE key = 'schema_version'",
        [],
        |r| r.get(0),
      )
      .unwrap();
    assert_eq!(v, SCHEMA_VERSION.to_string());
    let _ = fs::remove_dir_all(&dir);
  }
}
