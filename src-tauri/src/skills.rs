//! SKILL.md index, seed, enable/disable — Wave E.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

const STATE_FILE: &str = "skills_state.json";
const SKILLS_DIR: &str = "skills";
const PLUGINS_DIR: &str = "plugins";

const SEED_SOCRATIC_QUESTIONING: &str = r#"---
name: socratic-questioning
description: 苏格拉底式提问——澄清概念、暴露假设、追问证据
---

# 苏格拉底式提问

用提问引导用户自己厘清概念，而不是直接给答案。

- 一次只问一个问题，等用户回答再继续，不连续轰炸。
- 先澄清概念：让用户用自己的话定义当前讨论的关键词。
- 追问证据与理由：「你是根据什么得出这个结论的？」
- 暴露隐含假设：把用户话里没说出口的前提点出来，问他是否成立。
- 用用户自己的话复述他的主张，再请他确认或修正。
- 遇到反例或极端情况时，邀请用户一起检验原结论还站不站得住。
- 不直接给答案、不代答；让用户在自己推导中卡住再给最小提示。
"#;

const SEED_FEYNMAN_EXPLANATION: &str = r#"---
name: feynman-explanation
description: 费曼输出评价——让用户用自己的话解释，挑出术语伪装与逻辑跳跃
---

# 费曼输出评价

邀请用户把刚学的东西用自己的话讲出来，你负责挑毛病。

- 邀请用户「假设讲给一个完全不懂的人听」来解释概念。
- 听时重点抓：术语伪装（堆词但没讲清）、逻辑跳跃（中间缺步骤）、卡壳点（讲不下去）。
- 讲完给分层反馈：讲清 / 含糊 / 讲错，并指出具体在哪一段。
- 对含糊处追问「这句话具体指什么」，逼出准确定义。
- 给出重讲建议：建议从哪里重新组织，而不是直接替用户重讲。
- 不代写、不直接给标准答案；用户讲错时先指错，再让用户自己再讲一遍。
"#;

const SEED_ANALOGY_TUTOR: &str = r#"---
name: analogy-tutor
description: 类比引导——用类比辅助理解，并检验类比的边界与失效处
---

# 类比引导

用类比帮用户建立直觉，但明确类比不是定义。

- 选一个用户熟悉的场景做类比，先讲清「对应关系」：哪一面对应哪一面。
- 主动声明这个类比的边界：它在哪些地方会失效。
- 讲完请用户用自己的话复述这个类比，检验是否真懂。
- 当类比开始误导时，及时拉回精确定义，不要硬撑类比。
- 鼓励用户自己提出类比，你再帮他把不成立的对应关系挑出来。
- 类比只用于建立直觉，最终要回到概念本身的定义与性质。
"#;

const SEED_RECALL_QUIZ: &str = r#"---
name: recall-quiz
description: 回想式提问——间隔抽问已学内容，防「看着会、合上忘」
---

# 回想式提问

主动抽问之前聊过的内容，帮用户巩固记忆。

- 从「上次聊到 X」开始，请用户先不翻笔记、凭记忆回答。
- 一次问一个点，不一次性丢出一串问题。
- 用户答不出时给线索阶梯：先提示关键词，再提示场景，最后给一点框架。
- 不直接给全文答案；给线索让用户自己回想出来。
- 频率克制：用户说「停」或表现出疲惫时立即收手。
- 用户答对后简短确认，并顺带指出可加强的薄弱点。
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

  seed_skill_if_missing(&skills, "socratic-questioning", SEED_SOCRATIC_QUESTIONING)?;
  seed_skill_if_missing(&skills, "feynman-explanation", SEED_FEYNMAN_EXPLANATION)?;
  seed_skill_if_missing(&skills, "analogy-tutor", SEED_ANALOGY_TUTOR)?;
  seed_skill_if_missing(&skills, "recall-quiz", SEED_RECALL_QUIZ)?;

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

    let socratic = vault.join(".soit/skills/socratic-questioning/SKILL.md");
    let feynman = vault.join(".soit/skills/feynman-explanation/SKILL.md");
    let analogy = vault.join(".soit/skills/analogy-tutor/SKILL.md");
    let recall = vault.join(".soit/skills/recall-quiz/SKILL.md");
    let plugins = vault.join(".soit/plugins/README.md");
    assert!(socratic.is_file());
    assert!(feynman.is_file());
    assert!(analogy.is_file());
    assert!(recall.is_file());
    assert!(plugins.is_file());
    let plugins_txt = fs::read_to_string(&plugins).unwrap();
    assert!(plugins_txt.to_ascii_lowercase().contains("ignore"));

    let list = list_skills(&vault).unwrap();
    assert_eq!(list.len(), 4);
    assert!(list.iter().all(|s| s.enabled));

    let list2 = set_skill_enabled(&vault, "socratic-questioning", false).unwrap();
    let socratic_s = list2.iter().find(|s| s.id == "socratic-questioning").unwrap();
    assert!(!socratic_s.enabled);
    let feynman_s = list2.iter().find(|s| s.id == "feynman-explanation").unwrap();
    assert!(feynman_s.enabled);

    let text = get_enabled_skills_text(&vault).unwrap();
    assert!(!text.contains("skill:socratic-questioning"));
    assert!(text.contains("skill:feynman-explanation"));
    assert!(text.contains("费曼"));

    // re-seed does not overwrite user file
    let marker = "USER_EDIT_MARKER";
    fs::write(&socratic, format!("---\nname: socratic-questioning\n---\n{marker}\n")).unwrap();
    ensure_on_open(&vault).unwrap();
    let after = fs::read_to_string(&socratic).unwrap();
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
    let path = vault.join(".soit/skills/socratic-questioning/SKILL.md");
    fs::write(
      &path,
      format!("---\nname: socratic-questioning\ndescription: big\n---\n\n{big}\n"),
    )
    .unwrap();
    // Disable the other three seeds so only the oversized body is injected.
    set_skill_enabled(&vault, "feynman-explanation", false).unwrap();
    set_skill_enabled(&vault, "analogy-tutor", false).unwrap();
    set_skill_enabled(&vault, "recall-quiz", false).unwrap();
    let text = get_enabled_skills_text(&vault).unwrap();
    assert!(text.len() <= SKILLS_TEXT_SOFT_CAP);
    assert!(text.contains("skill:socratic-questioning"));
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
