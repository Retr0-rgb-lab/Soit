//! SKILL.md index, seed, enable/disable — Wave E.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

const STATE_FILE: &str = "skills_state.json";
const SKILLS_DIR: &str = "skills";
const PLUGINS_DIR: &str = "plugins";

const SEED_ORGANIZE_CARDS: &str = r#"---
name: organize-cards
description: 整理卡片宇宙——归并、归档、理清树结构
---

# 整理卡片宇宙

## Intent
帮助用户整理当前 vault 内的探究卡片树：合并重复线、归档已完成探究、理顺 parent 关系与活线注意力。

## Allowed tools
- list / read inquiry cards and edges (read graph)
- update card status (active / paused / done / stuck)
- suggest merges or archive — do not delete cards without explicit user confirmation
"#;

const SEED_ORGANIZE_OBSIDIAN: &str = r#"---
name: organize-obsidian
description: 整理 Obsidian 库——concepts / inquiry 与链接
---

# 整理 Obsidian 库

## Intent
帮助用户整理 vault 中给人看的 Markdown（concepts、inquiry 残渣），保持与卡片宇宙对齐，不另起第二套笔记编辑器。

## Allowed tools
- read / list notes under vault (concepts/, inquiry/, etc.)
- precipitate_concept / append_residue
- link suggestions between wiki pages and cards
- do not bulk-delete wiki pages; no code plugins in v1
"#;

const PLUGINS_README: &str = r#"# plugins/

v1 ignores code plugins. This directory is reserved for a future plugin runtime.

Skills are file-as-config under `../skills/<id>/SKILL.md` — enable/disable in the app settings list. No marketplace in v1.
"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDto {
  pub id: String,
  pub name: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub description: Option<String>,
  pub enabled: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct SkillsState {
  /// id → enabled. Missing id defaults to true.
  #[serde(default)]
  enabled: BTreeMap<String, bool>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillDoc {
  pub id: String,
  pub name: String,
  pub description: Option<String>,
  pub body: String,
  /// Full file text (frontmatter + body) for inject when preferred.
  pub raw: String,
}

/// Ensure skills/plugins layout and seed defaults. Safe to call on every open.
pub fn ensure_on_open(vault: &Path) -> Result<(), String> {
  let soit = vault.join(".soit");
  fs::create_dir_all(&soit).map_err(|e| format!("create .soit: {e}"))?;

  let skills = soit.join(SKILLS_DIR);
  fs::create_dir_all(&skills).map_err(|e| format!("create skills: {e}"))?;

  seed_skill_if_missing(&skills, "organize-cards", SEED_ORGANIZE_CARDS)?;
  seed_skill_if_missing(&skills, "organize-obsidian", SEED_ORGANIZE_OBSIDIAN)?;

  let plugins = soit.join(PLUGINS_DIR);
  fs::create_dir_all(&plugins).map_err(|e| format!("create plugins: {e}"))?;
  let plugins_readme = plugins.join("README.md");
  if !plugins_readme.exists() {
    fs::write(&plugins_readme, PLUGINS_README)
      .map_err(|e| format!("write plugins README: {e}"))?;
  }

  // Touch state file only if missing so defaults apply without overwriting user toggles.
  let state_path = soit.join(STATE_FILE);
  if !state_path.exists() {
    write_state(&state_path, &SkillsState::default())?;
  }

  Ok(())
}

fn seed_skill_if_missing(skills_root: &Path, id: &str, content: &str) -> Result<(), String> {
  let dir = skills_root.join(id);
  let path = dir.join("SKILL.md");
  if path.exists() {
    return Ok(());
  }
  fs::create_dir_all(&dir).map_err(|e| format!("create skill dir {id}: {e}"))?;
  fs::write(&path, content).map_err(|e| format!("write SKILL.md {id}: {e}"))?;
  Ok(())
}

fn state_path(vault: &Path) -> PathBuf {
  vault.join(".soit").join(STATE_FILE)
}

fn skills_root(vault: &Path) -> PathBuf {
  vault.join(".soit").join(SKILLS_DIR)
}

fn read_state(path: &Path) -> SkillsState {
  let Ok(raw) = fs::read_to_string(path) else {
    return SkillsState::default();
  };
  serde_json::from_str(&raw).unwrap_or_default()
}

fn write_state(path: &Path, state: &SkillsState) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|e| format!("create state parent: {e}"))?;
  }
  let raw = serde_json::to_string_pretty(state).map_err(|e| format!("serialize state: {e}"))?;
  fs::write(path, raw).map_err(|e| format!("write skills_state: {e}"))
}

fn is_enabled(state: &SkillsState, id: &str) -> bool {
  state.enabled.get(id).copied().unwrap_or(true)
}

/// Parse SKILL.md: optional YAML-like frontmatter between --- fences, rest body.
pub fn parse_skill_md(id: &str, raw: &str) -> SkillDoc {
  let normalized = raw.replace("\r\n", "\n");
  let trimmed = normalized.trim_start_matches('\u{feff}');

  let mut name = id.to_string();
  let mut description: Option<String> = None;
  let body: String;

  if let Some(rest) = trimmed.strip_prefix("---") {
    let rest = rest.strip_prefix('\n').unwrap_or(rest);
    if let Some(end) = rest.find("\n---") {
      let fm = &rest[..end];
      let after = &rest[end + "\n---".len()..];
      let after = after.strip_prefix('\n').unwrap_or(after);
      for line in fm.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
          continue;
        }
        if let Some((k, v)) = line.split_once(':') {
          let key = k.trim().to_ascii_lowercase();
          let val = v.trim().trim_matches('"').trim_matches('\'').to_string();
          if val.is_empty() {
            continue;
          }
          match key.as_str() {
            "name" => name = val,
            "description" | "desc" => description = Some(val),
            _ => {}
          }
        }
      }
      body = after.to_string();
    } else {
      body = trimmed.to_string();
    }
  } else {
    body = trimmed.to_string();
  }

  SkillDoc {
    id: id.to_string(),
    name,
    description,
    body: body.trim().to_string(),
    raw: trimmed.to_string(),
  }
}

fn index_skills(vault: &Path) -> Result<Vec<SkillDoc>, String> {
  let root = skills_root(vault);
  if !root.exists() {
    return Ok(vec![]);
  }
  let mut out = Vec::new();
  let entries = fs::read_dir(&root).map_err(|e| format!("read skills dir: {e}"))?;
  for ent in entries {
    let ent = ent.map_err(|e| format!("skills entry: {e}"))?;
    let path = ent.path();
    if !path.is_dir() {
      continue;
    }
    let id = ent.file_name().to_string_lossy().to_string();
    if id.starts_with('.') {
      continue;
    }
    let skill_path = path.join("SKILL.md");
    if !skill_path.is_file() {
      continue;
    }
    let raw = fs::read_to_string(&skill_path).map_err(|e| format!("read {id}/SKILL.md: {e}"))?;
    out.push(parse_skill_md(&id, &raw));
  }
  out.sort_by(|a, b| a.id.cmp(&b.id));
  Ok(out)
}

pub fn list_skills(vault: &Path) -> Result<Vec<SkillDto>, String> {
  let state = read_state(&state_path(vault));
  let docs = index_skills(vault)?;
  Ok(
    docs
      .into_iter()
      .map(|d| SkillDto {
        id: d.id.clone(),
        name: d.name,
        description: d.description,
        enabled: is_enabled(&state, &d.id),
      })
      .collect(),
  )
}

/// Safe skill id slug: letters, digits, `_`, `-` only (no path separators / `..`).
fn is_safe_skill_id(id: &str) -> bool {
  !id.is_empty()
    && id
      .bytes()
      .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

pub fn set_skill_enabled(vault: &Path, id: &str, enabled: bool) -> Result<Vec<SkillDto>, String> {
  let id = id.trim();
  if id.is_empty() {
    return Err("skill id is required".into());
  }
  if !is_safe_skill_id(id) {
    return Err(format!("invalid skill id: {id}"));
  }
  // Must exist on disk
  let skill_path = skills_root(vault).join(id).join("SKILL.md");
  if !skill_path.is_file() {
    return Err(format!("skill not found: {id}"));
  }
  let path = state_path(vault);
  let mut state = read_state(&path);
  state.enabled.insert(id.to_string(), enabled);
  write_state(&path, &state)?;
  list_skills(vault)
}

/// Soft cap on total inject text (bytes / UTF-8 len). Spec H-security §8.
const SKILLS_TEXT_SOFT_CAP: usize = 32_768;

fn truncate_utf8(s: &str, max_bytes: usize) -> String {
  if s.len() <= max_bytes {
    return s.to_string();
  }
  let mut end = max_bytes;
  while end > 0 && !s.is_char_boundary(end) {
    end -= 1;
  }
  s[..end].to_string()
}

/// Concatenate enabled skill bodies for chat system inject (Wave C consumes later).
/// Total length soft-capped at [`SKILLS_TEXT_SOFT_CAP`]; overflow truncates + logs.
pub fn get_enabled_skills_text(vault: &Path) -> Result<String, String> {
  let state = read_state(&state_path(vault));
  let docs = index_skills(vault)?;
  let mut parts: Vec<String> = Vec::new();
  for d in docs {
    if !is_enabled(&state, &d.id) {
      continue;
    }
    let header = format!("### skill:{} ({})", d.id, d.name);
    let body = if d.body.is_empty() {
      d.raw
    } else {
      d.body
    };
    parts.push(format!("{header}\n{body}"));
  }
  let mut out = parts.join("\n\n");
  if out.len() > SKILLS_TEXT_SOFT_CAP {
    log::warn!(
      "skills inject text truncated from {} to {} bytes",
      out.len(),
      SKILLS_TEXT_SOFT_CAP
    );
    out = truncate_utf8(&out, SKILLS_TEXT_SOFT_CAP);
  }
  Ok(out)
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::time::{SystemTime, UNIX_EPOCH};

  fn tmp_vault(tag: &str) -> PathBuf {
    let ms = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map(|d| d.as_millis())
      .unwrap_or(0);
    let dir = std::env::temp_dir().join(format!("soit_skills_{tag}_{ms}"));
    fs::create_dir_all(&dir).unwrap();
    dir
  }

  #[test]
  fn parse_frontmatter_and_body() {
    let raw = "---\nname: demo-skill\ndescription: A demo\n---\n\n# Hello\n\nBody line.\n";
    let doc = parse_skill_md("demo-skill", raw);
    assert_eq!(doc.id, "demo-skill");
    assert_eq!(doc.name, "demo-skill");
    assert_eq!(doc.description.as_deref(), Some("A demo"));
    assert!(doc.body.contains("# Hello"));
    assert!(doc.body.contains("Body line."));
    assert!(!doc.body.contains("---"));
  }

  #[test]
  fn parse_without_frontmatter() {
    let raw = "# Only body\n\nintent text";
    let doc = parse_skill_md("plain", raw);
    assert_eq!(doc.name, "plain");
    assert!(doc.description.is_none());
    assert!(doc.body.starts_with("# Only body"));
  }

  #[test]
  fn ensure_seeds_and_list_toggle() {
    let vault = tmp_vault("seed");
    ensure_on_open(&vault).unwrap();

    let cards = vault.join(".soit/skills/organize-cards/SKILL.md");
    let obs = vault.join(".soit/skills/organize-obsidian/SKILL.md");
    let plugins = vault.join(".soit/plugins/README.md");
    assert!(cards.is_file());
    assert!(obs.is_file());
    assert!(plugins.is_file());
    let plugins_txt = fs::read_to_string(&plugins).unwrap();
    assert!(plugins_txt.to_ascii_lowercase().contains("ignore"));

    let list = list_skills(&vault).unwrap();
    assert_eq!(list.len(), 2);
    assert!(list.iter().all(|s| s.enabled));

    let list2 = set_skill_enabled(&vault, "organize-cards", false).unwrap();
    let cards_s = list2.iter().find(|s| s.id == "organize-cards").unwrap();
    assert!(!cards_s.enabled);
    let obs_s = list2.iter().find(|s| s.id == "organize-obsidian").unwrap();
    assert!(obs_s.enabled);

    let text = get_enabled_skills_text(&vault).unwrap();
    assert!(!text.contains("skill:organize-cards"));
    assert!(text.contains("skill:organize-obsidian"));
    assert!(text.contains("Allowed tools") || text.contains("allowed tools") || text.contains("Intent") || text.contains("整理"));

    // re-seed does not overwrite user file
    let marker = "USER_EDIT_MARKER";
    fs::write(&cards, format!("---\nname: organize-cards\n---\n{marker}\n")).unwrap();
    ensure_on_open(&vault).unwrap();
    let after = fs::read_to_string(&cards).unwrap();
    assert!(after.contains(marker));

    let _ = fs::remove_dir_all(&vault);
  }

  #[test]
  fn set_enabled_unknown_errors() {
    let vault = tmp_vault("missing");
    ensure_on_open(&vault).unwrap();
    let err = set_skill_enabled(&vault, "no-such-skill", true).unwrap_err();
    assert!(err.contains("not found"));
    let _ = fs::remove_dir_all(&vault);
  }

  #[test]
  fn set_enabled_rejects_path_traversal_ids() {
    let vault = tmp_vault("trav");
    ensure_on_open(&vault).unwrap();
    for bad in ["../etc", "a/b", "a\\b", "..", "/abs", "foo.bar"] {
      let err = set_skill_enabled(&vault, bad, true).unwrap_err();
      assert!(err.contains("invalid skill id"), "id={bad} err={err}");
    }
    let _ = fs::remove_dir_all(&vault);
  }

  #[test]
  fn enabled_skills_text_soft_cap() {
    let vault = tmp_vault("cap");
    ensure_on_open(&vault).unwrap();
    let big = "x".repeat(40_000);
    let path = vault.join(".soit/skills/organize-cards/SKILL.md");
    fs::write(
      &path,
      format!("---\nname: organize-cards\ndescription: big\n---\n\n{big}\n"),
    )
    .unwrap();
    // Disable the other seed so only the oversized body is injected.
    set_skill_enabled(&vault, "organize-obsidian", false).unwrap();
    let text = get_enabled_skills_text(&vault).unwrap();
    assert!(text.len() <= SKILLS_TEXT_SOFT_CAP);
    assert!(text.contains("skill:organize-cards"));
    let _ = fs::remove_dir_all(&vault);
  }

  #[test]
  fn truncate_utf8_respects_char_boundary() {
    let s = "ab你好cd";
    // mid-codepoint cut should not panic and stay under max
    let t = truncate_utf8(s, 4);
    assert!(t.len() <= 4);
    assert!(t.is_char_boundary(t.len()));
  }
}
