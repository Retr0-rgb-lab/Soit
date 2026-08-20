use super::frontmatter::{compose_with_body, merge_card_ids, parse_card_ids, split_frontmatter};
use super::sanitize::strip_auto_markers;
use super::{
  atomic_write, concepts_dir, should_skip_body_overwrite, slugify, PrecipitateConceptResult,
  AUTO_END, AUTO_START,
};
use std::path::{Path, PathBuf};

fn concept_path(vault: &Path, slug: &str) -> PathBuf {
  concepts_dir(vault).join(format!("{slug}.md"))
}

fn build_auto_body(title: &str, question: Option<&str>, body_hint: Option<&str>) -> String {
  let title = strip_auto_markers(title);
  let question = question.map(strip_auto_markers);
  let body_hint = body_hint.map(strip_auto_markers);

  let mut bullets = Vec::new();
  if let Some(q) = question
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    bullets.push(format!("- 问题：{q}"));
  }
  if let Some(h) = body_hint
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
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
  let title_clean = strip_auto_markers(title);
  let slug = slugify(&title_clean);
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
      let next = compose_with_body(fm_opt.as_deref(), &card_ids, &body);
      if let Err(e) = atomic_write(&path, &next) {
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
    let content = compose_with_body(fm_opt.as_deref(), &card_ids, &auto);
    if let Err(e) = atomic_write(&path, &content) {
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
  let content = compose_with_body(None, &card_ids, &auto);
  if let Err(e) = atomic_write(&path, &content) {
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
