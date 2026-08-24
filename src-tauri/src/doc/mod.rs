//! Vault document resolve + text read (PEL-156) and materials list/import.

pub mod materials;
pub mod pdf_server;

use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};

use crate::AppState;
use tauri::State;

/// Default max bytes for `read_vault_text` (md/text P0).
pub const DEFAULT_MAX_TEXT_BYTES: u64 = 1_500_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DocKind {
  Md,
  Text,
  Pdf,
  Unsupported,
}

impl DocKind {
  pub fn as_str(self) -> &'static str {
    match self {
      DocKind::Md => "md",
      DocKind::Text => "text",
      DocKind::Pdf => "pdf",
      DocKind::Unsupported => "unsupported",
    }
  }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveVaultDocResult {
  pub ok: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub path_rel: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub path_abs: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub kind: Option<&'static str>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub display_name: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub size: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

impl ResolveVaultDocResult {
  fn err(msg: impl Into<String>) -> Self {
    Self {
      ok: false,
      path_rel: None,
      path_abs: None,
      kind: None,
      display_name: None,
      size: None,
      error: Some(msg.into()),
    }
  }

  fn ok(
    path_rel: String,
    path_abs: String,
    kind: DocKind,
    display_name: String,
    size: u64,
  ) -> Self {
    Self {
      ok: true,
      path_rel: Some(path_rel),
      path_abs: Some(path_abs),
      kind: Some(kind.as_str()),
      display_name: Some(display_name),
      size: Some(size),
      error: None,
    }
  }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadVaultTextResult {
  pub ok: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub text: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

impl ReadVaultTextResult {
  fn err(msg: impl Into<String>) -> Self {
    Self {
      ok: false,
      text: None,
      error: Some(msg.into()),
    }
  }

  fn ok(text: String) -> Self {
    Self {
      ok: true,
      text: Some(text),
      error: None,
    }
  }
}

/// Probe kind from file extension (lowercase, no leading dot).
pub fn probe_kind(path: &Path) -> DocKind {
  let ext = path
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("")
    .to_ascii_lowercase();
  match ext.as_str() {
    "md" | "markdown" => DocKind::Md,
    "pdf" => DocKind::Pdf,
    // Common plain-text-ish extensions for P0 companion read.
    "txt" | "text" | "csv" | "tsv" | "log" | "json" | "jsonl" | "xml" | "yaml" | "yml"
    | "toml" | "ini" | "cfg" | "conf" | "css" | "scss" | "less" | "html" | "htm" | "js"
    | "jsx" | "ts" | "tsx" | "mjs" | "cjs" | "rs" | "py" | "go" | "java" | "kt" | "c"
    | "h" | "cpp" | "hpp" | "cc" | "cs" | "rb" | "php" | "sh" | "bash" | "zsh" | "ps1"
    | "sql" | "graphql" | "mdx" | "rst" | "adoc" | "tex" | "svg" => DocKind::Text,
    _ => DocKind::Unsupported,
  }
}

/// Resolve `user_path` under `vault` with canonicalize sandbox.
/// Returns absolute path and vault-relative path using `/` separators.
pub fn resolve_under_vault(vault: &Path, user_path: &str) -> Result<(PathBuf, String), String> {
  let trimmed = user_path.trim();
  if trimmed.is_empty() {
    return Err("path is empty".into());
  }
  if trimmed.contains('\0') {
    return Err("path invalid".into());
  }

  let vault_canon =
    dunce::canonicalize(vault).map_err(|e| format!("canonicalize vault: {e}"))?;

  let candidate = {
    let p = Path::new(trimmed);
    if p.is_absolute() {
      p.to_path_buf()
    } else {
      vault_canon.join(p)
    }
  };

  let abs = dunce::canonicalize(&candidate).map_err(|e| format!("canonicalize path: {e}"))?;

  if !abs.starts_with(&vault_canon) {
    return Err("path escapes vault".into());
  }

  let rel = abs
    .strip_prefix(&vault_canon)
    .map_err(|_| "path escapes vault".to_string())?;
  let path_rel = path_rel_slash(rel);

  if path_rel.is_empty() {
    return Err("path is vault root".into());
  }
  if is_under_soit(&path_rel) {
    return Err("path under .soit is not readable".into());
  }

  Ok((abs, path_rel))
}

fn path_rel_slash(rel: &Path) -> String {
  rel
    .components()
    .filter_map(|c| match c {
      Component::Normal(s) => Some(s.to_string_lossy()),
      _ => None,
    })
    .collect::<Vec<_>>()
    .join("/")
}

fn is_under_soit(path_rel: &str) -> bool {
  let rel = path_rel.trim_start_matches('/');
  rel == ".soit" || rel.starts_with(".soit/")
}

fn display_name_of(path: &Path) -> String {
  path
    .file_name()
    .map(|n| n.to_string_lossy().into_owned())
    .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

/// Core resolve (testable without Tauri).
pub fn resolve_vault_doc_impl(vault: &Path, path: &str) -> ResolveVaultDocResult {
  match resolve_under_vault(vault, path) {
    Ok((abs, path_rel)) => {
      let meta = match fs::metadata(&abs) {
        Ok(m) => m,
        Err(e) => return ResolveVaultDocResult::err(format!("stat path: {e}")),
      };
      if !meta.is_file() {
        return ResolveVaultDocResult::err("path is not a file");
      }
      let kind = probe_kind(&abs);
      let display_name = display_name_of(&abs);
      let size = meta.len();
      ResolveVaultDocResult::ok(
        path_rel,
        abs.to_string_lossy().into_owned(),
        kind,
        display_name,
        size,
      )
    }
    Err(e) => ResolveVaultDocResult::err(e),
  }
}

/// Core text read (testable without Tauri).
pub fn read_vault_text_impl(
  vault: &Path,
  path_rel: &str,
  max_bytes: Option<u64>,
) -> ReadVaultTextResult {
  let max = max_bytes.unwrap_or(DEFAULT_MAX_TEXT_BYTES);
  let (abs, _) = match resolve_under_vault(vault, path_rel) {
    Ok(v) => v,
    Err(e) => return ReadVaultTextResult::err(e),
  };

  let meta = match fs::metadata(&abs) {
    Ok(m) => m,
    Err(e) => return ReadVaultTextResult::err(format!("stat path: {e}")),
  };
  if !meta.is_file() {
    return ReadVaultTextResult::err("path is not a file");
  }
  if meta.len() > max {
    return ReadVaultTextResult::err(format!(
      "file exceeds max_bytes ({max}): {} bytes",
      meta.len()
    ));
  }

  let bytes = match fs::read(&abs) {
    Ok(b) => b,
    Err(e) => return ReadVaultTextResult::err(format!("read path: {e}")),
  };
  match String::from_utf8(bytes) {
    Ok(text) => ReadVaultTextResult::ok(text),
    Err(_) => ReadVaultTextResult::err("invalid UTF-8"),
  }
}

pub(crate) fn with_open_vault<T>(
  state: &AppState,
  f: impl FnOnce(&Path) -> T,
) -> Result<T, String> {
  let g = state
    .universe
    .lock()
    .map_err(|_| "universe lock poisoned".to_string())?;
  let u = g.as_ref().ok_or_else(|| "universe_closed".to_string())?;
  Ok(f(&u.vault_path))
}

/// Resolve a vault-local document path (md/text/pdf/unsupported). Requires open universe.
#[tauri::command]
pub fn resolve_vault_doc(
  path: String,
  state: State<'_, AppState>,
) -> ResolveVaultDocResult {
  match with_open_vault(&state, |vault| resolve_vault_doc_impl(vault, &path)) {
    Ok(r) => r,
    Err(e) => ResolveVaultDocResult::err(e),
  }
}

/// Read UTF-8 text under vault path sandbox. Requires open universe. No truncation on oversize.
#[tauri::command]
pub fn read_vault_text(
  path_rel: String,
  max_bytes: Option<u64>,
  state: State<'_, AppState>,
) -> ReadVaultTextResult {
  match with_open_vault(&state, |vault| {
    read_vault_text_impl(vault, &path_rel, max_bytes)
  }) {
    Ok(r) => r,
    Err(e) => ReadVaultTextResult::err(e),
  }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetPdfPreviewUrlResult {
  pub ok: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub url: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

impl GetPdfPreviewUrlResult {
  fn err(msg: impl Into<String>) -> Self {
    Self {
      ok: false,
      url: None,
      error: Some(msg.into()),
    }
  }
}

/// Lazy PDF preview URL (PEL-156 P1). Loopback server + per-vault token; sandbox first.
#[tauri::command]
pub fn get_pdf_preview_url(
  path_rel: String,
  state: State<'_, AppState>,
) -> GetPdfPreviewUrlResult {
  let (vault_canon, abs) = {
    let g = match state.universe.lock() {
      Ok(g) => g,
      Err(_) => return GetPdfPreviewUrlResult::err("universe lock poisoned"),
    };
    let u = match g.as_ref() {
      Some(u) => u,
      None => return GetPdfPreviewUrlResult::err("universe_closed"),
    };
    let vault_canon = u.vault_path.clone();
    match resolve_under_vault(&vault_canon, &path_rel) {
      Ok((abs, _)) => (vault_canon, abs),
      Err(e) => return GetPdfPreviewUrlResult::err(e),
    }
  };
  if probe_kind(&abs) != DocKind::Pdf {
    return GetPdfPreviewUrlResult::err("not a pdf");
  }
  {
    let mut ps = match state.pdf_server.lock() {
      Ok(g) => g,
      Err(_) => return GetPdfPreviewUrlResult::err("pdf server lock poisoned"),
    };
    if ps.is_none() {
      *ps = match pdf_server::start_pdf_server(vault_canon) {
        Ok(h) => Some(h),
        Err(e) => return GetPdfPreviewUrlResult::err(format!("pdf server start failed: {e}")),
      };
    }
  }
  let g = match state.pdf_server.lock() {
    Ok(g) => g,
    Err(_) => return GetPdfPreviewUrlResult::err("pdf server lock poisoned"),
  };
  let handle = match g.as_ref() {
    Some(h) => h,
    None => return GetPdfPreviewUrlResult::err("pdf server unavailable"),
  };
  GetPdfPreviewUrlResult {
    ok: true,
    url: Some(pdf_server::pdf_url(handle, &path_rel)),
    error: None,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::Write;
  use std::time::{SystemTime, UNIX_EPOCH};

  fn temp_vault(label: &str) -> PathBuf {
    let ms = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map(|d| d.as_millis())
      .unwrap_or(0);
    let dir = std::env::temp_dir().join(format!("soit_doc_{label}_{ms}"));
    fs::create_dir_all(&dir).unwrap();
    // Ensure vault itself is canonicalizable.
    dunce::canonicalize(&dir).unwrap()
  }

  fn write_file(path: &Path, bytes: &[u8]) {
    if let Some(parent) = path.parent() {
      fs::create_dir_all(parent).unwrap();
    }
    let mut f = fs::File::create(path).unwrap();
    f.write_all(bytes).unwrap();
  }

  #[test]
  fn probe_kind_by_extension() {
    assert_eq!(probe_kind(Path::new("a/b/note.MD")), DocKind::Md);
    assert_eq!(probe_kind(Path::new("x.txt")), DocKind::Text);
    assert_eq!(probe_kind(Path::new("doc.pdf")), DocKind::Pdf);
    assert_eq!(probe_kind(Path::new("blob.bin")), DocKind::Unsupported);
  }

  #[test]
  fn resolve_and_read_md_under_vault() {
    let vault = temp_vault("ok");
    let md = vault.join("notes").join("hello.md");
    write_file(&md, "# Hello\n中文".as_bytes());

    let r = resolve_vault_doc_impl(&vault, "notes/hello.md");
    assert!(r.ok, "{:?}", r.error);
    assert_eq!(r.path_rel.as_deref(), Some("notes/hello.md"));
    assert_eq!(r.kind, Some("md"));
    assert_eq!(r.display_name.as_deref(), Some("hello.md"));
    assert!(r.size.unwrap() > 0);
    assert!(r.path_abs.as_ref().unwrap().contains("hello.md"));

    let read = read_vault_text_impl(&vault, "notes/hello.md", None);
    assert!(read.ok, "{:?}", read.error);
    assert_eq!(read.text.as_deref(), Some("# Hello\n中文"));

    let _ = fs::remove_dir_all(&vault);
  }

  #[test]
  fn path_rel_uses_forward_slashes() {
    let vault = temp_vault("slash");
    let md = vault.join("a").join("b").join("c.txt");
    write_file(&md, b"x");

    let (_abs, rel) = resolve_under_vault(&vault, "a\\b\\c.txt").unwrap();
    assert_eq!(rel, "a/b/c.txt");

    let _ = fs::remove_dir_all(&vault);
  }

  #[test]
  fn rejects_path_outside_vault() {
    let vault = temp_vault("out");
    write_file(&vault.join("in.md"), b"in");

    let outside = std::env::temp_dir().join(format!(
      "soit_doc_outside_{}",
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
    ));
    write_file(&outside, b"secret");

    let r = resolve_vault_doc_impl(&vault, outside.to_str().unwrap());
    assert!(!r.ok);
    assert!(
      r.error.as_deref().unwrap_or("").contains("escapes")
        || r.error.as_deref().unwrap_or("").contains("canonicalize"),
      "{:?}",
      r.error
    );

    let r2 = resolve_vault_doc_impl(&vault, "../nope.md");
    assert!(!r2.ok);

    let _ = fs::remove_file(&outside);
    let _ = fs::remove_dir_all(&vault);
  }

  #[test]
  fn rejects_soit_internal_paths() {
    let vault = temp_vault("soit");
    let secret = vault.join(".soit").join("universe.db");
    write_file(&secret, b"not-for-ui");

    let r = resolve_vault_doc_impl(&vault, ".soit/universe.db");
    assert!(!r.ok, "expected reject, got ok");
    assert!(
      r.error
        .as_deref()
        .unwrap_or("")
        .contains(".soit"),
      "{:?}",
      r.error
    );

    let read = read_vault_text_impl(&vault, ".soit/universe.db", None);
    assert!(!read.ok);

    let _ = fs::remove_dir_all(&vault);
  }

  #[test]
  fn oversize_text_errors_without_truncation() {
    let vault = temp_vault("big");
    let path = vault.join("big.txt");
    write_file(&path, &vec![b'a'; 100]);

    let read = read_vault_text_impl(&vault, "big.txt", Some(50));
    assert!(!read.ok);
    assert!(read.text.is_none());
    assert!(
      read.error.as_deref().unwrap_or("").contains("max_bytes"),
      "{:?}",
      read.error
    );

    let _ = fs::remove_dir_all(&vault);
  }

  #[test]
  fn invalid_utf8_errors() {
    let vault = temp_vault("bin");
    let path = vault.join("bad.txt");
    write_file(&path, &[0xff, 0xfe, 0xfd]);

    let read = read_vault_text_impl(&vault, "bad.txt", None);
    assert!(!read.ok);
    assert_eq!(read.error.as_deref(), Some("invalid UTF-8"));

    let _ = fs::remove_dir_all(&vault);
  }

  #[test]
  fn resolve_pdf_kind_without_reading_body() {
    let vault = temp_vault("pdf");
    let path = vault.join("paper.pdf");
    write_file(&path, b"%PDF-1.4 fake");

    let r = resolve_vault_doc_impl(&vault, "paper.pdf");
    assert!(r.ok, "{:?}", r.error);
    assert_eq!(r.kind, Some("pdf"));
    assert_eq!(r.path_rel.as_deref(), Some("paper.pdf"));

    let _ = fs::remove_dir_all(&vault);
  }

  #[test]
  fn result_json_is_camel_case() {
    let r = ResolveVaultDocResult::ok(
      "a/b.md".into(),
      "/vault/a/b.md".into(),
      DocKind::Md,
      "b.md".into(),
      12,
    );
    let json = serde_json::to_string(&r).unwrap();
    assert!(json.contains("pathRel"));
    assert!(json.contains("pathAbs"));
    assert!(json.contains("displayName"));
    assert!(!json.contains("path_rel"));
  }
}
