use super::{AUTO_END, AUTO_START};

/// Double-quoted YAML scalar escape for values written into frontmatter.
pub fn yaml_escape(s: &str) -> String {
  let mut out = String::with_capacity(s.len() + 2);
  out.push('"');
  for ch in s.chars() {
    match ch {
      '"' => out.push_str("\\\""),
      '\\' => out.push_str("\\\\"),
      '\n' => out.push_str("\\n"),
      '\r' => out.push_str("\\r"),
      '\t' => out.push_str("\\t"),
      c if (c as u32) < 0x20 => {
        out.push_str(&format!("\\u{:04x}", c as u32));
      }
      c => out.push(c),
    }
  }
  out.push('"');
  out
}

/// Unescape a YAML double-quoted or plain scalar (best-effort for ids we wrote).
pub fn yaml_unescape_scalar(raw: &str) -> String {
  let s = raw.trim();
  if s.len() >= 2 && s.starts_with('"') && s.ends_with('"') {
    let inner = &s[1..s.len() - 1];
    let mut out = String::with_capacity(inner.len());
    let mut chars = inner.chars().peekable();
    while let Some(c) = chars.next() {
      if c == '\\' {
        match chars.next() {
          Some('"') => out.push('"'),
          Some('\\') => out.push('\\'),
          Some('n') => out.push('\n'),
          Some('r') => out.push('\r'),
          Some('t') => out.push('\t'),
          Some('u') => {
            let mut hex = String::new();
            for _ in 0..4 {
              if let Some(h) = chars.next() {
                hex.push(h);
              }
            }
            if let Ok(v) = u32::from_str_radix(&hex, 16) {
              if let Some(ch) = char::from_u32(v) {
                out.push(ch);
              }
            }
          }
          Some(other) => {
            out.push('\\');
            out.push(other);
          }
          None => out.push('\\'),
        }
      } else {
        out.push(c);
      }
    }
    return out;
  }
  if s.len() >= 2 && s.starts_with('\'') && s.ends_with('\'') {
    return s[1..s.len() - 1].replace("''", "'");
  }
  s.to_string()
}

/// Remove AUTO marker literals from user-supplied title/question/hint fields.
pub fn strip_auto_markers(s: &str) -> String {
  s.replace(AUTO_START, "").replace(AUTO_END, "")
}
