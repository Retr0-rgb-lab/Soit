//! List + import under vault `materials/` (materials-rail SPE v1.1 §2.2).

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::SystemTime;

use super::{probe_kind, with_open_vault, DocKind};
use crate::AppState;
use tauri::State;

/// Decoded import ceiling (raw bytes after base64 decode).
pub const MAX_IMPORT_BYTES: u64 = 2_000_000;
pub const DEFAULT_MAX_DEPTH: u32 = 2;
pub const DEFAULT_MAX_ENTRIES: u32 = 200;

const MATERIALS_DIR: &str = "materials";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialsEntry {
  pub path_rel: String,
  pub name: String,
  pub kind: &'static str,
  pub size: u64,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub mtime_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListVaultMaterialsResult {
  pub ok: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub entries: Option<Vec<MaterialsEntry>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub truncated: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

impl ListVaultMaterialsResult {
  fn err(msg: impl Into<String>) -> Self {
    Self {
      ok: false,
      entries: None,
      truncated: None,
      error: Some(msg.into()),
    }
  }

  fn ok(entries: Vec<MaterialsEntry>, truncated: bool) -> Self {
    Self {
      ok: true,
      entries: Some(entries),
      truncated: Some(truncated),
      error: None,
    }
  }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportVaultMaterialResult {
  pub ok: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub path_rel: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

impl ImportVaultMaterialResult {
  fn err(msg: impl Into<String>) -> Self {
    Self {
      ok: false,
      path_rel: None,
      error: Some(msg.into()),
    }
  }

  fn ok(path_rel: String) -> Self {
    Self {
      ok: true,
      path_rel: Some(path_rel),
      error: None,
    }
  }
}

fn mtime_ms(meta: &fs::Metadata) -> Option<u64> {
  meta
    .modified()
    .ok()
    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
    .map(|d| d.as_millis() as u64)
}

/// Single-segment file name: no `/` `\` `..` or empty.
pub fn sanitize_material_file_name(file_name: &str) -> Result<String, String> {
  let trimmed = file_name.trim();
  if trimmed.is_empty() || trimmed.contains('\0') {
    return Err("invalid file name".into());
  }
  if trimmed.contains('/') || trimmed.contains('\\') {
    return Err("invalid file name".into());
  }
  if trimmed == "." || trimmed == ".." || trimmed.contains("..") {
    return Err("invalid file name".into());
  }

  let path = Path::new(trimmed);
  let mut normals = path.components().filter_map(|c| match c {
    Component::Normal(s) => Some(s.to_string_lossy().into_owned()),
    _ => None,
  });
  let only = normals.next();
  if only.is_none() || normals.next().is_some() {
    return Err("invalid file name".into());
  }
  let name = only.unwrap();
  if name.is_empty() || name == "." || name == ".." {
    return Err("invalid file name".into());
  }
  Ok(name)
}

fn unique_material_name(dir: &Path, name: &str) -> String {
  if !dir.join(name).exists() {
    return name.to_string();
  }
  let path = Path::new(name);
  let stem = path
    .file_stem()
    .map(|s| s.to_string_lossy().into_owned())
    .unwrap_or_else(|| name.to_string());
  let ext = path.extension().map(|s| s.to_string_lossy().into_owned());

  for n in 1..10_000 {
    let candidate = match &ext {
      Some(e) => format!("{stem} ({n}).{e}"),
      None => format!("{stem} ({n})"),
    };
    if !dir.join(&candidate).exists() {
      return candidate;
    }
  }
  match &ext {
    Some(e) => format!(
      "{stem}-{}.{}",
      SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0),
      e
    ),
    None => format!(
      "{stem}-{}",
      SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
    ),
  }
}

fn path_under_prefix(abs: &Path, prefix: &Path) -> bool {
  abs.starts_with(prefix)
}

/// Flatten files under `vault/materials/` up to maxDepth / maxEntries.
pub fn list_vault_materials_impl(
  vault: &Path,
  max_depth: Option<u32>,
  max_entries: Option<u32>,
) -> ListVaultMaterialsResult {
  let max_depth = max_depth.unwrap_or(DEFAULT_MAX_DEPTH);
  let max_entries = max_entries.unwrap_or(DEFAULT_MAX_ENTRIES) as usize;

  let materials = vault.join(MATERIALS_DIR);
  if !materials.exists() {
    return ListVaultMaterialsResult::ok(vec![], false);
  }

  let vault_canon = match dunce::canonicalize(vault) {
    Ok(p) => p,
    Err(e) => return ListVaultMaterialsResult::err(format!("canonicalize vault: {e}")),
  };
  let materials_canon = match dunce::canonicalize(&materials) {
    Ok(p) => p,
    Err(e) => return ListVaultMaterialsResult::err(format!("canonicalize materials: {e}")),
  };

  if !path_under_prefix(&materials_canon, &vault_canon) {
    return ListVaultMaterialsResult::err("materials escapes vault");
  }
  // materials must be a directory
  match fs::metadata(&materials_canon) {
    Ok(m) if m.is_dir() => {}
    Ok(_) => return ListVaultMaterialsResult::err("materials is not a directory"),
    Err(e) => return ListVaultMaterialsResult::err(format!("stat materials: {e}")),
  }

  let mut entries: Vec<MaterialsEntry> = Vec::new();
  let mut truncated = false;

  if let Err(e) = walk_materials(
    &materials_canon,
    &materials_canon,
    0,
    max_depth,
    max_entries,
    &mut entries,
    &mut truncated,
  ) {
    return ListVaultMaterialsResult::err(e);
  }

  entries.sort_by(|a, b| a.path_rel.cmp(&b.path_rel));
  ListVaultMaterialsResult::ok(entries, truncated)
}

fn walk_materials(
  materials_canon: &Path,
  dir: &Path,
  depth: u32,
  max_depth: u32,
  max_entries: usize,
  out: &mut Vec<MaterialsEntry>,
  truncated: &mut bool,
) -> Result<(), String> {
  if out.len() >= max_entries {
    *truncated = true;
    return Ok(());
  }

  let read = fs::read_dir(dir).map_err(|e| format!("read_dir: {e}"))?;
  let mut children: Vec<PathBuf> = Vec::new();
  for ent in read {
    let ent = ent.map_err(|e| format!("read_dir entry: {e}"))?;
    children.push(ent.path());
  }
  children.sort();

  for child in children {
    if out.len() >= max_entries {
      *truncated = true;
      break;
    }

    // Skip symlinks that escape: canonicalize and prefix-check.
    let abs = match dunce::canonicalize(&child) {
      Ok(p) => p,
      Err(_) => continue, // broken link / race — skip
    };
    if !path_under_prefix(&abs, materials_canon) {
      continue;
    }

    let meta = match fs::metadata(&abs) {
      Ok(m) => m,
      Err(_) => continue,
    };

    if meta.is_file() {
      let name = abs
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| abs.to_string_lossy().into_owned());
      let rel_under = abs
        .strip_prefix(materials_canon)
        .map_err(|_| "path escapes materials".to_string())?;
      let under = rel_under
        .components()
        .filter_map(|c| match c {
          Component::Normal(s) => Some(s.to_string_lossy()),
          _ => None,
        })
        .collect::<Vec<_>>()
        .join("/");
      let path_rel = if under.is_empty() {
        format!("{MATERIALS_DIR}/{name}")
      } else {
        format!("{MATERIALS_DIR}/{under}")
      };
      let kind = match probe_kind(&abs) {
        DocKind::Md => "md",
        DocKind::Text => "text",
        DocKind::Pdf => "pdf",
        DocKind::Unsupported => "unsupported",
      };
      out.push(MaterialsEntry {
        path_rel,
        name,
        kind,
        size: meta.len(),
        mtime_ms: mtime_ms(&meta),
      });
    } else if meta.is_dir() {
      if depth < max_depth {
        walk_materials(
          materials_canon,
          &abs,
          depth + 1,
          max_depth,
          max_entries,
          out,
          truncated,
        )?;
      }
    }
  }
  Ok(())
}

/// Decode base64 and write under `vault/materials/` (create dir if needed).
pub fn import_vault_material_impl(
  vault: &Path,
  file_name: &str,
  bytes_base64: &str,
) -> ImportVaultMaterialResult {
  let name = match sanitize_material_file_name(file_name) {
    Ok(n) => n,
    Err(e) => return ImportVaultMaterialResult::err(e),
  };

  let compact: String = bytes_base64
    .chars()
    .filter(|c| !c.is_whitespace())
    .collect();
  let bytes = match STANDARD.decode(compact.as_bytes()) {
    Ok(b) => b,
    Err(_) => return ImportVaultMaterialResult::err("invalid base64"),
  };

  if bytes.len() as u64 > MAX_IMPORT_BYTES {
    return ImportVaultMaterialResult::err("file_too_large");
  }

  let materials = vault.join(MATERIALS_DIR);
  if let Err(e) = fs::create_dir_all(&materials) {
    return ImportVaultMaterialResult::err(format!("create materials: {e}"));
  }

  let vault_canon = match dunce::canonicalize(vault) {
    Ok(p) => p,
    Err(e) => return ImportVaultMaterialResult::err(format!("canonicalize vault: {e}")),
  };
  let materials_canon = match dunce::canonicalize(&materials) {
    Ok(p) => p,
    Err(e) => {
      return ImportVaultMaterialResult::err(format!("canonicalize materials: {e}"))
    }
  };
  if !path_under_prefix(&materials_canon, &vault_canon) {
    return ImportVaultMaterialResult::err("materials escapes vault");
  }

  let dest_name = unique_material_name(&materials_canon, &name);
  // dest_name is a single sanitized segment; join under materials only.
  let dest = materials_canon.join(&dest_name);
  if dest.file_name().and_then(|n| n.to_str()) != Some(dest_name.as_str()) {
    return ImportVaultMaterialResult::err("invalid file name");
  }

  if let Err(e) = fs::write(&dest, &bytes) {
    return ImportVaultMaterialResult::err(format!("write material: {e}"));
  }

  // Post-write sandbox check (symlink races).
  let abs = match dunce::canonicalize(&dest) {
    Ok(p) => p,
    Err(e) => {
      let _ = fs::remove_file(&dest);
      return ImportVaultMaterialResult::err(format!("canonicalize written path: {e}"));
    }
  };
  if !path_under_prefix(&abs, &materials_canon) {
    let _ = fs::remove_file(&abs);
    return ImportVaultMaterialResult::err("path escapes materials");
  }

  let path_rel = format!("{MATERIALS_DIR}/{dest_name}");
  ImportVaultMaterialResult::ok(path_rel)
}

/// Lazy list of files under vault `materials/`. Requires open universe.
#[tauri::command]
pub fn list_vault_materials(
  max_depth: Option<u32>,
  max_entries: Option<u32>,
  state: State<'_, AppState>,
) -> ListVaultMaterialsResult {
  match with_open_vault(&state, |vault| {
    list_vault_materials_impl(vault, max_depth, max_entries)
  }) {
    Ok(r) => r,
    Err(e) => ListVaultMaterialsResult::err(e),
  }
}

/// Import one file (base64) into vault `materials/`. Requires open universe.
#[tauri::command]
pub fn import_vault_material(
  file_name: String,
  bytes_base64: String,
  state: State<'_, AppState>,
) -> ImportVaultMaterialResult {
  match with_open_vault(&state, |vault| {
    import_vault_material_impl(vault, &file_name, &bytes_base64)
  }) {
    Ok(r) => r,
    Err(e) => ImportVaultMaterialResult::err(e),
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
    let dir = std::env::temp_dir().join(format!("soit_mat_{label}_{ms}"));
    fs::create_dir_all(&dir).unwrap();
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
  fn list_empty_when_materials_missing() {
    let vault = temp_vault("empty");
    let r = list_vault_materials_impl(&vault, None, None);
    assert!(r.ok, "{:?}", r.error);
    assert_eq!(r.entries.as_ref().map(|e| e.len()), Some(0));
    assert_eq!(r.truncated, Some(false));
    let _ = fs::remove_dir_all(&vault);
  }

  #[test]
  fn list_flattens_files_under_materials() {
    let vault = temp_vault("list");
    write_file(&vault.join("materials").join("a.md"), b"# A");
    write_file(
      &vault.join("materials").join("sub").join("b.txt"),
      b"hello",
    );
    // Outside materials — must not appear
    write_file(&vault.join("notes").join("secret.md"), b"nope");

    let r = list_vault_materials_impl(&vault, None, None);
    assert!(r.ok, "{:?}", r.error);
    let entries = r.entries.unwrap();
    let paths: Vec<_> = entries.iter().map(|e| e.path_rel.as_str()).collect();
    assert!(paths.contains(&"materials/a.md"), "{paths:?}");
    assert!(paths.contains(&"materials/sub/b.txt"), "{paths:?}");
    assert!(!paths.iter().any(|p| p.contains("secret")));
    assert_eq!(
      entries.iter().find(|e| e.path_rel == "materials/a.md").unwrap().kind,
      "md"
    );

    let _ = fs::remove_dir_all(&vault);
  }

  #[test]
  fn list_respects_max_entries_truncated() {
    let vault = temp_vault("trunc");
    for i in 0..5 {
      write_file(
        &vault.join("materials").join(format!("f{i}.md")),
        b"x",
      );
    }
    let r = list_vault_materials_impl(&vault, Some(2), Some(3));
    assert!(r.ok, "{:?}", r.error);
    assert_eq!(r.entries.as_ref().map(|e| e.len()), Some(3));
    assert_eq!(r.truncated, Some(true));
    let _ = fs::remove_dir_all(&vault);
  }

  #[test]
  fn import_ok_writes_under_materials() {
    let vault = temp_vault("imp");
    let b64 = STANDARD.encode(b"# imported\n");
    let r = import_vault_material_impl(&vault, "note.md", &b64);
    assert!(r.ok, "{:?}", r.error);
    assert_eq!(r.path_rel.as_deref(), Some("materials/note.md"));
    let body = fs::read_to_string(vault.join("materials").join("note.md")).unwrap();
    assert_eq!(body, "# imported\n");

    // collision suffix
    let r2 = import_vault_material_impl(&vault, "note.md", &b64);
    assert!(r2.ok, "{:?}", r2.error);
    assert_eq!(r2.path_rel.as_deref(), Some("materials/note (1).md"));

    let _ = fs::remove_dir_all(&vault);
  }

  #[test]
  fn import_rejects_too_large() {
    let vault = temp_vault("big");
    let raw = vec![b'a'; (MAX_IMPORT_BYTES as usize) + 1];
    let b64 = STANDARD.encode(&raw);
    let r = import_vault_material_impl(&vault, "big.bin", &b64);
    assert!(!r.ok);
    assert_eq!(r.error.as_deref(), Some("file_too_large"));
    assert!(!vault.join("materials").join("big.bin").exists());
    let _ = fs::remove_dir_all(&vault);
  }

  #[test]
  fn import_rejects_path_escape_names() {
    let vault = temp_vault("esc");
    let b64 = STANDARD.encode(b"x");
    for bad in ["../evil.md", "a/b.md", "a\\b.md", "..", "", "foo/../bar.md"] {
      let r = import_vault_material_impl(&vault, bad, &b64);
      assert!(!r.ok, "expected reject for {bad:?}");
      assert!(
        r.error.as_deref().unwrap_or("").contains("invalid"),
        "{bad:?} => {:?}",
        r.error
      );
    }
    let _ = fs::remove_dir_all(&vault);
  }

  #[test]
  fn sanitize_rejects_dotdot_substring() {
    assert!(sanitize_material_file_name("foo..bar.md").is_err());
    assert!(sanitize_material_file_name("ok-name.md").is_ok());
  }

  #[test]
  fn result_json_is_camel_case() {
    let r = ListVaultMaterialsResult::ok(
      vec![MaterialsEntry {
        path_rel: "materials/a.md".into(),
        name: "a.md".into(),
        kind: "md",
        size: 1,
        mtime_ms: Some(100),
      }],
      false,
    );
    let json = serde_json::to_string(&r).unwrap();
    assert!(json.contains("pathRel"));
    assert!(json.contains("mtimeMs"));
    assert!(json.contains("truncated"));
    assert!(!json.contains("path_rel"));

    let imp = ImportVaultMaterialResult::ok("materials/a.md".into());
    let j2 = serde_json::to_string(&imp).unwrap();
    assert!(j2.contains("pathRel"));
  }
}
