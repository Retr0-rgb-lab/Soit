//! Multi-workspace registry + resolution logic — pure, no Tauri/Universe deps.
//!
//! Kept dependency-light (std + `dunce`) so the resolution algorithm is
//! unit-testable in isolation from the Tauri desktop stack. `Universe`
//! opening/caching lives in `mod.rs`; this module only decides *which* vault.

use std::path::{Path, PathBuf};

/// Canonicalize a vault path. `dunce` normalizes Windows UNC/verbatim paths
/// that `std::fs::canonicalize` leaves mangled. Failure → `None` (caller rejects).
pub fn canonicalize_vault(p: &str) -> Option<PathBuf> {
  dunce::canonicalize(p).ok()
}

/// Build the allowlist registry from explicit `--vault`s and session recents.
///
/// - Explicit entries: order-preserving, dedup, **not** truncated.
/// - Recents: dedup fill after explicit, total cap `MAX_REGISTRY`.
/// - Default: first explicit entry, else `last_vault` if present in registry,
///   else `None`.
///
/// Returns `(registry, default)`.
pub fn build_registry(
  explicit: &[String],
  recents: &[String],
  last_vault: Option<&str>,
) -> (Vec<String>, Option<String>) {
  const MAX_REGISTRY: usize = 8;

  let mut out: Vec<String> = Vec::new();
  let mut seen: Vec<String> = Vec::new();

  fn push_unique(out: &mut Vec<String>, seen: &mut Vec<String>, raw: &str) {
    let t = raw.trim();
    if t.is_empty() {
      return;
    }
    if seen.iter().any(|s| s == t) {
      return;
    }
    seen.push(t.to_string());
    out.push(t.to_string());
  }

  // Explicit first — never truncated (user-specified entries must survive).
  for p in explicit {
    push_unique(&mut out, &mut seen, p);
  }
  // Recents fill up to cap.
  for p in recents {
    if out.len() >= MAX_REGISTRY {
      break;
    }
    push_unique(&mut out, &mut seen, p);
  }

  let default = explicit
    .iter()
    .map(|s| s.trim().to_string())
    .find(|s| !s.is_empty())
    .or_else(|| {
      last_vault
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .filter(|s| out.iter().any(|o| o == s))
        .map(String::from)
    });

  (out, default)
}

/// Allowlist check: `allow_any` bypasses; otherwise both sides are
/// canonicalized before comparison. Canonicalize failure → reject (guards
/// `..` / symlink escape + Windows case differences).
pub fn is_allowed(allowlist: &[String], allow_any: bool, requested: &str) -> bool {
  if allow_any {
    return true;
  }
  let Some(req) = canonicalize_vault(requested) else {
    return false;
  };
  allowlist
    .iter()
    .any(|a| canonicalize_vault(a).map(|c| c == req).unwrap_or(false))
}

/// Resolve the target vault path in priority order:
/// `args.vault` > `selected` > single allowlist entry > readable error.
///
/// Purely decides the raw path string; caller performs the allowlist check and
/// opens the `Universe`.
pub fn resolve_target(
  args_vault: Option<&str>,
  selected: Option<&Path>,
  allowlist: &[String],
) -> Result<String, String> {
  if let Some(v) = args_vault {
    let t = v.trim();
    if !t.is_empty() {
      return Ok(t.to_string());
    }
  }
  if let Some(s) = selected {
    return Ok(s.to_string_lossy().to_string());
  }
  if allowlist.len() == 1 {
    return Ok(allowlist[0].clone());
  }
  if allowlist.is_empty() {
    return Err(
      "no workspaces registered — start `soit mcp serve --vault <absolute path>`".into(),
    );
  }
  Err(
    "multiple workspaces available — call list_workspaces then select_workspace first".into(),
  )
}

#[cfg(test)]
mod tests {
  use super::*;

  fn tmp(label: &str) -> PathBuf {
    let ms = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap()
      .as_millis();
    let d = std::env::temp_dir().join(format!("soit_ws_{label}_{ms}"));
    std::fs::create_dir_all(&d).unwrap();
    d
  }

  #[test]
  fn build_registry_explicit_first_no_truncation() {
    let explicit: Vec<String> = (0..12).map(|i| format!("/vaults/e{i}")).collect();
    let (reg, default) = build_registry(&explicit, &[], None);
    // explicit never truncated even beyond cap
    assert_eq!(reg.len(), 12);
    assert_eq!(reg[0], "/vaults/e0");
    assert_eq!(default.as_deref(), Some("/vaults/e0"));
  }

  #[test]
  fn build_registry_recents_fill_capped_at_8() {
    let explicit = vec!["/vaults/a".to_string()];
    let recents: Vec<String> = (0..10).map(|i| format!("/vaults/r{i}")).collect();
    let (reg, _) = build_registry(&explicit, &recents, None);
    assert_eq!(reg.len(), 8); // 1 explicit + 7 recents
    assert_eq!(reg[0], "/vaults/a");
    assert_eq!(reg[1], "/vaults/r0");
    assert_eq!(reg[7], "/vaults/r6");
  }

  #[test]
  fn build_registry_dedup_between_explicit_and_recents() {
    let explicit = vec!["/vaults/a".to_string()];
    let recents = vec!["/vaults/a".to_string(), "/vaults/b".to_string()];
    let (reg, _) = build_registry(&explicit, &recents, None);
    assert_eq!(reg, vec!["/vaults/a".to_string(), "/vaults/b".to_string()]);
  }

  #[test]
  fn build_registry_default_last_vault_only_if_in_registry() {
    let recents = vec!["/vaults/x".to_string(), "/vaults/y".to_string()];
    let (reg, default) = build_registry(&[], &recents, Some("/vaults/y"));
    assert_eq!(reg, recents);
    assert_eq!(default.as_deref(), Some("/vaults/y"));

    let (_, default2) = build_registry(&[], &recents, Some("/vaults/not-in"));
    assert_eq!(default2, None);
  }

  #[test]
  fn build_registry_empty_and_whitespace_dropped() {
    let explicit = vec!["  ".to_string(), "/vaults/a".to_string(), "/vaults/a".to_string()];
    let (reg, default) = build_registry(&explicit, &[], None);
    assert_eq!(reg, vec!["/vaults/a".to_string()]);
    assert_eq!(default.as_deref(), Some("/vaults/a"));
  }

  #[test]
  fn is_allowed_matches_canonicalized_paths() {
    let d = tmp("allow");
    let real = d.join("v");
    std::fs::create_dir_all(&real).unwrap();
    let allowlist = vec![real.to_string_lossy().to_string()];
    // match via a `..` traversal (all components exist) that canonicalizes to the same path
    let dotted = d.join("v").join("..").join("v").to_string_lossy().to_string();
    assert!(is_allowed(&allowlist, false, &dotted));
    // non-existent path → canonicalize fails → reject
    assert!(!is_allowed(&allowlist, false, "/definitely/not/here"));
    // allow_any bypasses
    assert!(is_allowed(&allowlist, true, "/anything/at/all"));
    let _ = std::fs::remove_dir_all(&d);
  }

  #[test]
  fn resolve_target_priority() {
    let allowlist = vec!["/vaults/a".to_string(), "/vaults/b".to_string()];
    // args.vault wins
    assert_eq!(
      resolve_target(Some("/vaults/x"), Some(Path::new("/vaults/b")), &allowlist).unwrap(),
      "/vaults/x"
    );
    // selected wins when no args.vault
    assert_eq!(
      resolve_target(None, Some(Path::new("/vaults/b")), &allowlist).unwrap(),
      "/vaults/b"
    );
    // single allowlist entry auto-fallback
    assert_eq!(
      resolve_target(None, None, &["/vaults/only".to_string()]).unwrap(),
      "/vaults/only"
    );
  }

  #[test]
  fn resolve_target_multi_requires_selection() {
    let allowlist = vec!["/vaults/a".to_string(), "/vaults/b".to_string()];
    let err = resolve_target(None, None, &allowlist).unwrap_err();
    assert!(err.contains("list_workspaces"));
  }

  #[test]
  fn resolve_target_empty_registry_readable() {
    let err = resolve_target(None, None, &[]).unwrap_err();
    assert!(err.contains("no workspaces registered"));
  }
}
