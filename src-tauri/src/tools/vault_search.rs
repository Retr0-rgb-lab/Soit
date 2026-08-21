//! Substring search under vault materials/concepts/inquiry (+ root *.md).

use serde_json::{json, Value};
use std::fs;
use std::path::Path;

const MAX_QUERY: usize = 200;
const DEFAULT_LIMIT: usize = 6;
const MAX_LIMIT: usize = 12;
const MAX_FILE_BYTES: u64 = 64 * 1024;
const MAX_SNIPPET: usize = 400;
const MAX_TOTAL_CHARS: usize = 24 * 1024;

pub fn vault_search(vault: &Path, query: &str, limit: Option<u32>) -> Result<Value, String> {
  let q = query.trim();
  if q.is_empty() {
    return Err("query is empty".into());
  }
  if q.len() > MAX_QUERY {
    return Err("query too long".into());
  }
  let lim = limit
    .map(|n| n as usize)
    .unwrap_or(DEFAULT_LIMIT)
    .clamp(1, MAX_LIMIT);

  let q_lower = q.to_lowercase();
  let mut hits: Vec<Value> = Vec::new();
  let mut total_chars = 0usize;

  let roots = [
    vault.join("materials"),
    vault.join("concepts"),
    vault.join("inquiry"),
  ];

  for root in &roots {
    if root.is_dir() {
      walk_dir(root, vault, &q_lower, &mut hits, &mut total_chars, lim)?;
      if hits.len() >= lim || total_chars >= MAX_TOTAL_CHARS {
        break;
      }
    }
  }

  // Root-level md/txt only (one level)
  if hits.len() < lim && total_chars < MAX_TOTAL_CHARS {
    if let Ok(rd) = fs::read_dir(vault) {
      for ent in rd.flatten() {
        let p = ent.path();
        if !p.is_file() {
          continue;
        }
        let name = p
          .file_name()
          .and_then(|s| s.to_str())
          .unwrap_or("")
          .to_ascii_lowercase();
        if name.starts_with('.') {
          continue;
        }
        if !(name.ends_with(".md") || name.ends_with(".txt")) {
          continue;
        }
        try_file(&p, vault, &q_lower, &mut hits, &mut total_chars)?;
        if hits.len() >= lim || total_chars >= MAX_TOTAL_CHARS {
          break;
        }
      }
    }
  }

  Ok(json!({
    "query": q,
    "count": hits.len(),
    "hits": hits,
  }))
}

fn walk_dir(
  dir: &Path,
  vault: &Path,
  q_lower: &str,
  hits: &mut Vec<Value>,
  total_chars: &mut usize,
  lim: usize,
) -> Result<(), String> {
  let rd = match fs::read_dir(dir) {
    Ok(r) => r,
    Err(_) => return Ok(()),
  };
  for ent in rd.flatten() {
    if hits.len() >= lim || *total_chars >= MAX_TOTAL_CHARS {
      break;
    }
    let p = ent.path();
    let name = p
      .file_name()
      .and_then(|s| s.to_str())
      .unwrap_or("")
      .to_ascii_lowercase();
    if name == ".soit" || name == ".git" || name == "node_modules" || name.starts_with('.') {
      continue;
    }
    if p.is_dir() {
      walk_dir(&p, vault, q_lower, hits, total_chars, lim)?;
    } else if p.is_file() && (name.ends_with(".md") || name.ends_with(".txt")) {
      try_file(&p, vault, q_lower, hits, total_chars)?;
    }
  }
  Ok(())
}

fn try_file(
  path: &Path,
  vault: &Path,
  q_lower: &str,
  hits: &mut Vec<Value>,
  total_chars: &mut usize,
) -> Result<(), String> {
  let meta = match fs::metadata(path) {
    Ok(m) => m,
    Err(_) => return Ok(()),
  };
  if meta.len() > MAX_FILE_BYTES {
    return Ok(());
  }
  let text = match fs::read_to_string(path) {
    Ok(t) => t,
    Err(_) => return Ok(()),
  };
  let lower = text.to_lowercase();
  let Some(idx) = lower.find(q_lower) else {
    return Ok(());
  };
  let start = idx.saturating_sub(80);
  let end = (idx + q_lower.len() + 200).min(text.len());
  // byte-safe-ish: clamp to char boundaries
  let snippet = slice_chars(&text, start, end, MAX_SNIPPET);
  let rel = path
    .strip_prefix(vault)
    .unwrap_or(path)
    .to_string_lossy()
    .replace('\\', "/");
  *total_chars += snippet.len() + rel.len();
  hits.push(json!({
    "path": rel,
    "snippet": snippet,
  }));
  Ok(())
}

fn slice_chars(s: &str, byte_start: usize, byte_end: usize, max_chars: usize) -> String {
  let start = floor_char_boundary(s, byte_start);
  let end = ceil_char_boundary(s, byte_end.min(s.len()));
  let chunk = &s[start..end];
  let mut out = String::new();
  for (i, ch) in chunk.chars().enumerate() {
    if i >= max_chars {
      out.push('…');
      break;
    }
    out.push(ch);
  }
  out
}

fn floor_char_boundary(s: &str, i: usize) -> usize {
  if i >= s.len() {
    return s.len();
  }
  let mut j = i;
  while j > 0 && !s.is_char_boundary(j) {
    j -= 1;
  }
  j
}

fn ceil_char_boundary(s: &str, i: usize) -> usize {
  if i >= s.len() {
    return s.len();
  }
  let mut j = i;
  while j < s.len() && !s.is_char_boundary(j) {
    j += 1;
  }
  j
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::Write;

  #[test]
  fn finds_in_materials() {
    let dir = std::env::temp_dir().join(format!("soit_vs_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(dir.join("materials")).unwrap();
    let mut f = fs::File::create(dir.join("materials/note.md")).unwrap();
    writeln!(f, "hello 偏微分方程 world").unwrap();
    let v = vault_search(&dir, "偏微分", Some(5)).unwrap();
    assert_eq!(v["count"], 1);
    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn skips_soit() {
    let dir = std::env::temp_dir().join(format!("soit_vs2_{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(dir.join(".soit/secret")).unwrap();
    fs::write(dir.join(".soit/secret/x.md"), "secret-token-xyz").unwrap();
    fs::create_dir_all(dir.join("concepts")).unwrap();
    fs::write(dir.join("concepts/a.md"), "public-token-xyz").unwrap();
    let v = vault_search(&dir, "secret-token", Some(5)).unwrap();
    assert_eq!(v["count"], 0);
    let v2 = vault_search(&dir, "public-token", Some(5)).unwrap();
    assert_eq!(v2["count"], 1);
    let _ = fs::remove_dir_all(&dir);
  }
}
