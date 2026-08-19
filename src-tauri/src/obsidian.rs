//! Obsidian precipitate — concept pages + residue snippets (Wave D).
//! Never writes per-card full chat transcripts.

use serde::Serialize;
use std::path::{Path, PathBuf};

pub const AUTO_START: &str = "<!-- soit:auto:start -->";
pub const AUTO_END: &str = "<!-- soit:auto:end -->";

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

/// Lowercase ASCII slug; non-alnum runs become single `-`.
pub fn slugify(title: &str) -> String {
  let mut out = String::with_capacity(title.len());
  let mut prev_dash = false;
  for ch in title.chars() {
    let c = ch.to_ascii_lowercase();
    if c.is_ascii_alphanumeric() {
      out.push(c);
      prev_dash = false;
    } else if !prev_dash && !out.is_empty() {
      out.push('-');
      prev_dash = true;
    }
  }
  let trimmed = out.trim_matches('-').to_string();
  if trimmed.is_empty() {
    "untitled".into()
  } else {
    // keep path-safe length
    trimmed.chars().take(80).collect()
  }
}

fn concepts_dir(vault: &Path) -> PathBuf {
  vault.join("concepts")
}

fn inquiry_dir(vault: &Path) -> PathBuf {
  vault.join("inquiry")
}

fn concept_path(vault: &Path, slug: &str) -> PathBuf {
  concepts_dir(vault).join(format!("{slug}.md"))
}

/// Split optional YAML frontmatter from body.
fn split_frontmatter(raw: &str) -> (Option<String>, String) {
  let bytes = raw.as_bytes();
  if !raw.starts_with("---") {
    return (None, raw.to_string());
  }
  let after = if bytes.len() > 3 && bytes[3] == b'\r' {
    4
  } else {
    3
  };
  let rest = &raw[after..];
  let rest = rest.strip_prefix('\n').unwrap_or(rest);
  // find closing ---
  let mut search_from = 0usize;
  while let Some(rel) = rest[search_from..].find("---") {
    let abs = search_from + rel;
    let before_ok = abs == 0 || rest.as_bytes()[abs - 1] == b'\n';
    if !before_ok {
      search_from = abs + 3;
      continue;
    }
    let after_close = abs + 3;
    let fm = rest[..abs].trim_end_matches(['\r', '\n']).to_string();
    let body = rest[after_close..]
      .strip_prefix('\r')
      .unwrap_or(&rest[after_close..])
      .strip_prefix('\n')
      .unwrap_or(&rest[after_close..])
      .to_string();
    return (Some(fm), body);
  }
  (None, raw.to_string())
}

/// Parse `soit_card_ids` list from a simple YAML frontmatter block.
fn parse_card_ids(fm: &str) -> Vec<String> {
  let mut ids = Vec::new();
  let mut in_list = false;
  for line in fm.lines() {
    let t = line.trim();
    if t.starts_with("soit_card_ids:") {
      let rest = t["soit_card_ids:".len()..].trim();
      if rest.starts_with('[') && rest.ends_with(']') {
        let inner = &rest[1..rest.len() - 1];
        for part in inner.split(',') {
          let id = part.trim().trim_matches('"').trim_matches('\'').trim();
          if !id.is_empty() {
            ids.push(id.to_string());
          }
        }
        in_list = false;
      } else if rest.is_empty() {
        in_list = true;
      }
      continue;
    }
    if in_list {
      if let Some(item) = t.strip_prefix('-') {
        let id = item.trim().trim_matches('"').trim_matches('\'').trim();
        if !id.is_empty() {
          ids.push(id.to_string());
        }
      } else if !t.is_empty() && !t.starts_with('#') {
        in_list = false;
      }
    }
  }
  ids
}

fn merge_card_ids(existing: &[String], card_id: &str) -> Vec<String> {
  let mut out = existing.to_vec();
  if !out.iter().any(|id| id == card_id) {
    out.push(card_id.to_string());
  }
  out
}

fn format_frontmatter(card_ids: &[String]) -> String {
  let mut s = String::from("---\nsoit_card_ids:\n");
  for id in card_ids {
    s.push_str(&format!("  - \"{id}\"\n"));
  }
  s.push_str("soit_managed: true\n---\n");
  s
}

fn build_auto_body(title: &str, question: Option<&str>, body_hint: Option<&str>) -> String {
  let mut bullets = Vec::new();
  if let Some(q) = question.map(str::trim).filter(|s| !s.is_empty()) {
    bullets.push(format!("- 问题：{q}"));
  }
  if let Some(h) = body_hint.map(str::trim).filter(|s| !s.is_empty()) {
    bullets.push(format!("- {h}"));
  }
  if bullets.is_empty() {
    bullets.push("- （由 Soit 沉淀）".into());
  }
  format!(
    "{AUTO_START}\n# {title}\n\n{}\n{AUTO_END}\n",
    bullets.join("\n")
  )
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

fn rewrite_frontmatter_only(raw: &str, card_ids: &[String]) -> String {
  let (fm_opt, body) = split_frontmatter(raw);
  let _ = fm_opt;
  let mut out = format_frontmatter(card_ids);
  if !body.is_empty() {
    if !body.starts_with('\n') && !out.ends_with('\n') {
      out.push('\n');
    }
    out.push_str(&body);
    if !body.ends_with('\n') {
      out.push('\n');
    }
  }
  out
}

/// Write or update `concepts/{slug}.md`. Never writes chat transcripts.
pub fn write_concept(
  vault: &Path,
  card_id: &str,
  title: &str,
  question: Option<&str>,
  body_hint: Option<&str>,
) -> PrecipitateConceptResult {
  if card_id.trim().is_empty() {
    return PrecipitateConceptResult {
      ok: false,
      path: None,
      body_written: false,
      body_skipped: false,
      error: Some("card_id required".into()),
      card_ids: vec![],
    };
  }
  let slug = slugify(title);
  let dir = concepts_dir(vault);
  if let Err(e) = std::fs::create_dir_all(&dir) {
    return PrecipitateConceptResult {
      ok: false,
      path: None,
      body_written: false,
      body_skipped: false,
      error: Some(format!("create concepts/: {e}")),
      card_ids: vec![],
    };
  }
  let path = concept_path(vault, &slug);
  let path_str = path.to_string_lossy().to_string();

  if path.exists() {
    let raw = match std::fs::read_to_string(&path) {
      Ok(s) => s,
      Err(e) => {
        return PrecipitateConceptResult {
          ok: false,
          path: Some(path_str),
          body_written: false,
          body_skipped: false,
          error: Some(format!("read concept: {e}")),
          card_ids: vec![],
        };
      }
    };
    let (fm_opt, body) = split_frontmatter(&raw);
    let existing_ids = fm_opt
      .as_deref()
      .map(parse_card_ids)
      .unwrap_or_default();
    let card_ids = merge_card_ids(&existing_ids, card_id);

    if should_skip_body_overwrite(&body) {
      let next = rewrite_frontmatter_only(&raw, &card_ids);
      if let Err(e) = std::fs::write(&path, next) {
        return PrecipitateConceptResult {
          ok: false,
          path: Some(path_str),
          body_written: false,
          body_skipped: true,
          error: Some(format!("update frontmatter: {e}")),
          card_ids,
        };
      }
      return PrecipitateConceptResult {
        ok: true,
        path: Some(path_str),
        body_written: false,
        body_skipped: true,
        error: None,
        card_ids,
      };
    }

    // Markers present (or empty body): rewrite auto region, preserve empty user region.
    let auto = build_auto_body(title, question, body_hint);
    let content = format!("{}{}", format_frontmatter(&card_ids), auto);
    if let Err(e) = std::fs::write(&path, content) {
      return PrecipitateConceptResult {
        ok: false,
        path: Some(path_str),
        body_written: false,
        body_skipped: false,
        error: Some(format!("write concept: {e}")),
        card_ids,
      };
    }
    return PrecipitateConceptResult {
      ok: true,
      path: Some(path_str),
      body_written: true,
      body_skipped: false,
      error: None,
      card_ids,
    };
  }

  // Fresh file
  let card_ids = vec![card_id.to_string()];
  let auto = build_auto_body(title, question, body_hint);
  let content = format!("{}{}", format_frontmatter(&card_ids), auto);
  if let Err(e) = std::fs::write(&path, content) {
    return PrecipitateConceptResult {
      ok: false,
      path: Some(path_str),
      body_written: false,
      body_skipped: false,
      error: Some(format!("write concept: {e}")),
      card_ids,
    };
  }
  PrecipitateConceptResult {
    ok: true,
    path: Some(path_str),
    body_written: true,
    body_skipped: false,
    error: None,
    card_ids,
  }
}

fn today_ymd() -> String {
  // Local-ish date from system time (UTC calendar day is fine for residue filename).
  use std::time::{SystemTime, UNIX_EPOCH};
  let secs = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs())
    .unwrap_or(0);
  // days since epoch
  let days = (secs / 86_400) as i64;
  // civil from days (Howard Hinnant algorithm)
  let z = days + 719_468;
  let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
  let doe = (z - era * 146_097) as u64;
  let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
  let y = yoe as i64 + era * 400;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let d = doy - (153 * mp + 2) / 5 + 1;
  let m = if mp < 10 { mp + 3 } else { mp - 9 };
  let y = if m <= 2 { y + 1 } else { y };
  format!("{y:04}-{m:02}-{d:02}")
}

fn now_hms() -> String {
  use std::time::{SystemTime, UNIX_EPOCH};
  let secs = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs())
    .unwrap_or(0);
  let tod = secs % 86_400;
  let h = tod / 3600;
  let m = (tod % 3600) / 60;
  let s = tod % 60;
  format!("{h:02}:{m:02}:{s:02}")
}

/// Append a short residue snippet under `inquiry/{date}-residue.md`.
pub fn write_residue(vault: &Path, card_id: &str, text: &str) -> AppendResidueResult {
  let text = text.trim();
  if card_id.trim().is_empty() {
    return AppendResidueResult {
      ok: false,
      path: None,
      error: Some("card_id required".into()),
    };
  }
  if text.is_empty() {
    return AppendResidueResult {
      ok: false,
      path: None,
      error: Some("text required".into()),
    };
  }
  let dir = inquiry_dir(vault);
  if let Err(e) = std::fs::create_dir_all(&dir) {
    return AppendResidueResult {
      ok: false,
      path: None,
      error: Some(format!("create inquiry/: {e}")),
    };
  }
  let path = dir.join(format!("{}-residue.md", today_ymd()));
  let path_str = path.to_string_lossy().to_string();
  let snippet = format!(
    "\n## {} · card `{card_id}`\n\n{text}\n",
    now_hms()
  );
  let needs_header = !path.exists();
  let mut block = String::new();
  if needs_header {
    block.push_str(&format!(
      "---\nsoit_residue: true\n---\n\n# Residue · {}\n",
      today_ymd()
    ));
  }
  block.push_str(&snippet);

  use std::io::Write;
  let mut file = match std::fs::OpenOptions::new()
    .create(true)
    .append(true)
    .open(&path)
  {
    Ok(f) => f,
    Err(e) => {
      return AppendResidueResult {
        ok: false,
        path: Some(path_str),
        error: Some(format!("open residue: {e}")),
      };
    }
  };
  if let Err(e) = file.write_all(block.as_bytes()) {
    return AppendResidueResult {
      ok: false,
      path: Some(path_str),
      error: Some(format!("append residue: {e}")),
    };
  }
  AppendResidueResult {
    ok: true,
    path: Some(path_str),
    error: None,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
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
    assert_eq!(slugify("概念 ABC"), "abc");
    assert_eq!(slugify("概念"), "untitled");
    assert_eq!(slugify(""), "untitled");
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
    assert!(path.ends_with("concepts/bayes-rule.md") || path.to_string_lossy().contains("bayes-rule.md"));
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

    // slugify("Hand Written") would differ; write via title matching slug
    let r = write_concept(&vault, "c_new", "hand written", Some("q"), None);
    // slug is hand-written
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
    // append again
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
}
