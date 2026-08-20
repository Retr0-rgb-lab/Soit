//! Obsidian precipitate — concept pages + residue snippets.
//! Never writes per-card full chat transcripts.

mod concept;
mod frontmatter;
mod residue;
mod sanitize;
mod slug;

pub use concept::write_concept;
pub use residue::write_residue;
pub use slug::slugify;

use serde::Serialize;

pub const AUTO_START: &str = "<!-- soit:auto:start -->";
pub const AUTO_END: &str = "<!-- soit:auto:end -->";

/// Residue body text hard cap (Unicode scalar values).
pub const RESIDUE_TEXT_MAX_CHARS: usize = 8000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrecipitateConceptResult {
  pub ok: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub path: Option<String>,
  pub body_written: bool,
  /// True when user-owned body was preserved (frontmatter ids may still update).
  pub body_skipped: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
  pub card_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendResidueResult {
  pub ok: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub path: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

pub(crate) fn concepts_dir(vault: &std::path::Path) -> std::path::PathBuf {
  vault.join("concepts")
}

pub(crate) fn inquiry_dir(vault: &std::path::Path) -> std::path::PathBuf {
  vault.join("inquiry")
}

/// True when we must not rewrite the concept body (user edit / missing markers).
pub fn should_skip_body_overwrite(body: &str) -> bool {
  match user_body_outside_auto(body) {
    None => {
      // Missing soit:auto region → treat whole body as user-owned if non-empty.
      !body.trim().is_empty()
    }
    Some(user) => !user.trim().is_empty(),
  }
}

/// Body content outside the auto markers (user-owned region).
fn user_body_outside_auto(body: &str) -> Option<String> {
  let start = body.find(AUTO_START)?;
  let end_rel = body[start..].find(AUTO_END)?;
  let end = start + end_rel + AUTO_END.len();
  let before = body[..start].trim();
  let after = body[end..].trim();
  let mut parts = Vec::new();
  if !before.is_empty() {
    parts.push(before);
  }
  if !after.is_empty() {
    parts.push(after);
  }
  Some(parts.join("\n\n"))
}

/// Atomic write: `path` + `.tmp` then rename over destination.
pub(crate) fn atomic_write(path: &std::path::Path, content: &str) -> Result<(), String> {
  let mut tmp_os = path.as_os_str().to_os_string();
  tmp_os.push(".tmp");
  let tmp = std::path::PathBuf::from(tmp_os);
  std::fs::write(&tmp, content).map_err(|e| format!("write temp: {e}"))?;
  // Windows rename cannot replace an existing file.
  if path.exists() {
    std::fs::remove_file(path).map_err(|e| format!("replace target: {e}"))?;
  }
  std::fs::rename(&tmp, path).map_err(|e| {
    let _ = std::fs::remove_file(&tmp);
    format!("rename concept: {e}")
  })?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::obsidian::frontmatter::{merge_frontmatter, parse_card_ids, split_frontmatter};
  use crate::obsidian::sanitize::{strip_auto_markers, yaml_escape};
  use std::path::PathBuf;
  use std::time::{SystemTime, UNIX_EPOCH};

  fn temp_vault(label: &str) -> PathBuf {
    let n = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map(|d| d.as_millis())
      .unwrap_or(0);
    let dir = std::env::temp_dir().join(format!("soit_obsidian_{label}_{n}"));
    std::fs::create_dir_all(&dir).unwrap();
    dir
  }

  #[test]
  fn slugify_basic() {
    assert_eq!(slugify("Hello World"), "hello-world");
    assert_eq!(slugify("  Foo---Bar  "), "foo-bar");
    assert_eq!(slugify("概念 ABC"), "概念-abc");
    assert_eq!(slugify("概念"), "概念");
    assert_eq!(slugify(""), "untitled");
    assert_eq!(slugify("!!!"), "untitled");
    assert!(!slugify("a/b\\c").contains('/'));
    assert!(!slugify("a/b\\c").contains('\\'));
  }

  #[test]
  fn write_concept_creates_file_with_markers_and_card_id() {
    let vault = temp_vault("create");
    let r = write_concept(
      &vault,
      "c_test1",
      "Bayes Rule",
      Some("What is P(H|E)?"),
      Some("short hint"),
    );
    assert!(r.ok, "{:?}", r.error);
    assert!(r.body_written);
    assert!(!r.body_skipped);
    assert_eq!(r.card_ids, vec!["c_test1".to_string()]);
    let path = PathBuf::from(r.path.unwrap());
    assert!(
      path.ends_with("concepts/bayes-rule.md") || path.to_string_lossy().contains("bayes-rule.md")
    );
    let raw = std::fs::read_to_string(&path).unwrap();
    assert!(raw.contains("soit_card_ids:"));
    assert!(raw.contains("c_test1"));
    assert!(raw.contains(AUTO_START));
    assert!(raw.contains(AUTO_END));
    assert!(raw.contains("What is P(H|E)?"));
    assert!(!raw.contains("user:")); // no transcript shape
    let _ = std::fs::remove_dir_all(&vault);
  }

  #[test]
  fn second_precipitate_merges_ids_and_rewrites_auto_when_no_user_body() {
    let vault = temp_vault("merge");
    let _ = write_concept(&vault, "c_a", "Topic X", Some("q1"), None);
    let r2 = write_concept(&vault, "c_b", "Topic X", Some("q2 updated"), None);
    assert!(r2.ok, "{:?}", r2.error);
    assert!(r2.body_written);
    assert!(!r2.body_skipped);
    assert!(r2.card_ids.contains(&"c_a".into()));
    assert!(r2.card_ids.contains(&"c_b".into()));
    let raw = std::fs::read_to_string(r2.path.unwrap()).unwrap();
    assert!(raw.contains("q2 updated"));
    assert!(raw.contains("c_a"));
    assert!(raw.contains("c_b"));
    let _ = std::fs::remove_dir_all(&vault);
  }

  #[test]
  fn user_edited_body_outside_markers_is_not_overwritten() {
    let vault = temp_vault("guard");
    let r1 = write_concept(&vault, "c_1", "Guarded", Some("orig q"), None);
    assert!(r1.ok);
    let path = PathBuf::from(r1.path.unwrap());
    let raw = std::fs::read_to_string(&path).unwrap();
    // User appends notes outside auto region
    let edited = format!("{raw}\n\n## My notes\n\nKeep this forever.\n");
    std::fs::write(&path, &edited).unwrap();

    let r2 = write_concept(
      &vault,
      "c_2",
      "Guarded",
      Some("should not appear in body"),
      Some("evil overwrite"),
    );
    assert!(r2.ok, "{:?}", r2.error);
    assert!(!r2.body_written);
    assert!(r2.body_skipped);
    assert!(r2.card_ids.contains(&"c_1".into()));
    assert!(r2.card_ids.contains(&"c_2".into()));

    let after = std::fs::read_to_string(&path).unwrap();
    assert!(after.contains("Keep this forever."));
    assert!(!after.contains("should not appear in body"));
    assert!(!after.contains("evil overwrite"));
    assert!(after.contains("c_2"));
    let _ = std::fs::remove_dir_all(&vault);
  }

  #[test]
  fn missing_auto_markers_skips_body_overwrite() {
    let vault = temp_vault("nomarkers");
    let dir = concepts_dir(&vault);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("hand-written.md");
    std::fs::write(
      &path,
      "---\nsoit_card_ids:\n  - \"c_old\"\n---\n# Hand\n\nUser prose only.\n",
    )
    .unwrap();

    let r = write_concept(&vault, "c_new", "hand written", Some("q"), None);
    assert_eq!(slugify("hand written"), "hand-written");
    assert!(r.ok, "{:?}", r.error);
    assert!(r.body_skipped);
    assert!(!r.body_written);
    let after = std::fs::read_to_string(&path).unwrap();
    assert!(after.contains("User prose only."));
    assert!(!after.contains(AUTO_START));
    assert!(after.contains("c_new"));
    let _ = std::fs::remove_dir_all(&vault);
  }

  #[test]
  fn append_residue_creates_inquiry_file_with_card_id() {
    let vault = temp_vault("residue");
    let r = write_residue(&vault, "c_res1", "fleeting thought");
    assert!(r.ok, "{:?}", r.error);
    let path = PathBuf::from(r.path.unwrap());
    assert!(path.to_string_lossy().contains("inquiry"));
    assert!(path.to_string_lossy().contains("residue.md"));
    let raw = std::fs::read_to_string(&path).unwrap();
    assert!(raw.contains("c_res1"));
    assert!(raw.contains("fleeting thought"));
    let r2 = write_residue(&vault, "c_res1", "second note");
    assert!(r2.ok);
    let raw2 = std::fs::read_to_string(&path).unwrap();
    assert!(raw2.contains("second note"));
    assert!(raw2.matches("fleeting thought").count() >= 1);
    let _ = std::fs::remove_dir_all(&vault);
  }

  #[test]
  fn should_skip_detects_user_region() {
    let clean = format!("{AUTO_START}\n# T\n\n- x\n{AUTO_END}\n");
    assert!(!should_skip_body_overwrite(&clean));
    let dirty = format!("{clean}\n\nuser added\n");
    assert!(should_skip_body_overwrite(&dirty));
    assert!(should_skip_body_overwrite("# no markers\n"));
    assert!(!should_skip_body_overwrite(""));
  }

  #[test]
  fn precipitate_preserves_unknown_frontmatter_tags() {
    let vault = temp_vault("tags");
    let dir = concepts_dir(&vault);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("tagged.md");
    std::fs::write(
      &path,
      "---\ntags: [a, b]\nalias: keep-me\nsoit_card_ids:\n  - \"c_old\"\ncustom_key: 42\n---\n# Tagged\n\nUser prose stays.\n",
    )
    .unwrap();

    let r = write_concept(&vault, "c_new", "tagged", Some("q"), None);
    assert!(r.ok, "{:?}", r.error);
    assert!(r.body_skipped);
    let after = std::fs::read_to_string(&path).unwrap();
    assert!(after.contains("tags: [a, b]"), "tags must survive: {after}");
    assert!(after.contains("alias: keep-me"));
    assert!(after.contains("custom_key: 42"));
    assert!(after.contains("c_old"));
    assert!(after.contains("c_new"));
    assert!(after.contains("soit_managed: true"));
    assert!(after.contains("User prose stays."));
    let _ = std::fs::remove_dir_all(&vault);
  }

  #[test]
  fn strip_markers_from_title_question_hint() {
    let vault = temp_vault("markers");
    let evil_title = format!("Safe {AUTO_START} injected {AUTO_END} Title");
    let evil_q = format!("q {AUTO_START}");
    let evil_h = format!("{AUTO_END} hint");
    let r = write_concept(
      &vault,
      "c_mk",
      &evil_title,
      Some(&evil_q),
      Some(&evil_h),
    );
    assert!(r.ok, "{:?}", r.error);
    let raw = std::fs::read_to_string(r.path.unwrap()).unwrap();
    // Body auto region still has exactly one pair of markers from template.
    assert_eq!(raw.matches(AUTO_START).count(), 1);
    assert_eq!(raw.matches(AUTO_END).count(), 1);
    assert!(raw.contains("Safe  injected  Title") || raw.contains("Safe injected Title") || raw.contains("# Safe"));
    assert!(!raw.contains("injected <!--"));
    // Title slug should not embed marker junk as path breakers
    assert!(!slugify(&evil_title).contains('/'));
    let _ = std::fs::remove_dir_all(&vault);
  }

  #[test]
  fn yaml_special_chars_in_card_id_are_escaped() {
    let vault = temp_vault("yamlid");
    let id = "c_\"x\\y\n";
    let r = write_concept(&vault, id, "Yaml Id", None, None);
    assert!(r.ok, "{:?}", r.error);
    let raw = std::fs::read_to_string(r.path.unwrap()).unwrap();
    assert!(raw.contains(&yaml_escape(id)), "expected escaped id in FM: {raw}");
    // Must not break frontmatter with bare quote
    let (fm, _) = split_frontmatter(&raw);
    let fm = fm.expect("frontmatter");
    let ids = parse_card_ids(&fm);
    assert!(ids.iter().any(|x| x == id), "round-trip ids: {ids:?}");
    let _ = std::fs::remove_dir_all(&vault);
  }

  #[test]
  fn residue_rejects_overlong_text() {
    let vault = temp_vault("longres");
    let big: String = "字".repeat(RESIDUE_TEXT_MAX_CHARS + 1);
    let r = write_residue(&vault, "c_1", &big);
    assert!(!r.ok);
    assert!(r.error.as_deref().unwrap_or("").contains("8000"));
    let _ = std::fs::remove_dir_all(&vault);
  }

  #[test]
  fn merge_frontmatter_preserves_keys_unit() {
    let fm = "tags: [a]\ntitle: Hello\nsoit_card_ids:\n  - \"old\"\nnote: x\n";
    let out = merge_frontmatter(Some(fm), &["old".into(), "new".into()]);
    assert!(out.starts_with("---\n"));
    assert!(out.contains("tags: [a]"));
    assert!(out.contains("title: Hello"));
    assert!(out.contains("note: x"));
    assert!(out.contains("soit_managed: true"));
    assert!(out.contains(&yaml_escape("new")));
    // old list item form replaced, not duplicated block keys wildly
    assert_eq!(out.matches("soit_card_ids:").count(), 1);
    assert_eq!(out.matches("soit_managed:").count(), 1);
  }

  #[test]
  fn strip_auto_markers_unit() {
    let s = format!("pre {AUTO_START} mid {AUTO_END} post");
    assert_eq!(strip_auto_markers(&s), "pre  mid  post");
  }

  #[test]
  fn atomic_write_leaves_no_tmp_on_success() {
    let vault = temp_vault("atomic");
    let r = write_concept(&vault, "c_at", "Atomic", None, None);
    assert!(r.ok, "{:?}", r.error);
    let path = PathBuf::from(r.path.unwrap());
    let tmp = {
      let mut p = path.as_os_str().to_os_string();
      p.push(".tmp");
      PathBuf::from(p)
    };
    assert!(path.is_file());
    assert!(!tmp.exists(), "temp file should be renamed away");
    let _ = std::fs::remove_dir_all(&vault);
  }
}
