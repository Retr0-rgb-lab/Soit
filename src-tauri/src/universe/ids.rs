//! Host id generation and small text helpers.

use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_ms() -> u128 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis())
    .unwrap_or(0)
}

pub fn new_id(prefix: &str) -> String {
  use std::sync::atomic::{AtomicU64, Ordering};
  static SEQ: AtomicU64 = AtomicU64::new(0);
  let n = SEQ.fetch_add(1, Ordering::Relaxed);
  format!("{prefix}_{}_{n}", now_ms())
}

/// Escape text before embedding into HTML (deepen seed ai_html / similar).
pub fn escape_html(s: &str) -> String {
  let mut out = String::with_capacity(s.len());
  for ch in s.chars() {
    match ch {
      '&' => out.push_str("&amp;"),
      '<' => out.push_str("&lt;"),
      '>' => out.push_str("&gt;"),
      '"' => out.push_str("&quot;"),
      '\'' => out.push_str("&#39;"),
      _ => out.push(ch),
    }
  }
  out
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn escape_html_entities() {
    assert_eq!(escape_html("a<b>&\"'"), "a&lt;b&gt;&amp;&quot;&#39;");
  }
}
