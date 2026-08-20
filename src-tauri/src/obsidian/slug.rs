/// Path-safe slug: Unicode letters/digits kept (CJK ok); ASCII lowercased; other runs → `-`.
/// Never emits `/` or `\\`.
pub fn slugify(title: &str) -> String {
  let mut out = String::with_capacity(title.len());
  let mut prev_dash = false;
  for ch in title.chars() {
    // Explicitly reject path separators even if a platform treated them as alnum.
    if ch == '/' || ch == '\\' {
      if !prev_dash && !out.is_empty() {
        out.push('-');
        prev_dash = true;
      }
      continue;
    }
    if ch.is_alphanumeric() {
      for c in ch.to_lowercase() {
        out.push(c);
      }
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
