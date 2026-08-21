//! HTTP GET + crude HTML text extract with SSRF checks.

use super::ssrf::validate_fetch_url;
use regex::Regex;
use std::time::Duration;

const TIMEOUT_SECS: u64 = 12;
const MAX_BODY: usize = 1_500_000;
const MAX_TEXT_CHARS: usize = 12_000;

/// Redirect policy that re-runs SSRF checks on every hop.
/// Takes `allow_loopback` by value so the `'static` Policy closure owns it (no borrow).
fn ssrf_redirect_policy(allow_loopback: bool) -> reqwest::redirect::Policy {
  reqwest::redirect::Policy::custom(move |attempt| {
    if attempt.previous().len() >= 3 {
      return attempt.stop();
    }
    match validate_fetch_url(attempt.url().as_str(), allow_loopback) {
      Ok(_) => attempt.follow(),
      Err(_) => attempt.error(std::io::Error::new(
        std::io::ErrorKind::PermissionDenied,
        "redirect target blocked",
      )),
    }
  })
}

pub fn fetch_url(raw_url: &str, allow_loopback: bool) -> Result<(String, String, String), String> {
  let url = validate_fetch_url(raw_url, allow_loopback)?;
  let client = reqwest::blocking::Client::builder()
    .timeout(Duration::from_secs(TIMEOUT_SECS))
    .redirect(ssrf_redirect_policy(allow_loopback))
    .user_agent("SoitHost/1.0 (+local inquiry tools)")
    .build()
    .map_err(|e| format!("http client: {e}"))?;

  let resp = client
    .get(url.clone())
    .send()
    .map_err(|e| format!("request failed: {e}"))?;

  let status = resp.status();
  if !status.is_success() {
    return Err(format!("HTTP {status}"));
  }

  let bytes = resp
    .bytes()
    .map_err(|e| format!("read body: {e}"))?;
  if bytes.len() > MAX_BODY {
    return Err(format!("response too large ({} bytes)", bytes.len()));
  }

  let raw = String::from_utf8_lossy(&bytes);
  let text = html_to_text(&raw);
  let clipped: String = text.chars().take(MAX_TEXT_CHARS).collect();
  let host = url.host_str().unwrap_or("").to_string();
  let summary = format!("{} · {} 字", host, clipped.chars().count());
  let title = format!("读取 {}", host);
  Ok((title, summary, clipped))
}

fn html_to_text(html: &str) -> String {
  let mut s = html.to_string();
  // strip script/style
  if let Ok(re) = Regex::new(r"(?is)<script[^>]*>.*?</script>") {
    s = re.replace_all(&s, " ").into_owned();
  }
  if let Ok(re) = Regex::new(r"(?is)<style[^>]*>.*?</style>") {
    s = re.replace_all(&s, " ").into_owned();
  }
  if let Ok(re) = Regex::new(r"(?is)<!--.*?-->") {
    s = re.replace_all(&s, " ").into_owned();
  }
  if let Ok(re) = Regex::new(r"(?i)<br\s*/?>") {
    s = re.replace_all(&s, "\n").into_owned();
  }
  if let Ok(re) = Regex::new(r"(?i)</p>") {
    s = re.replace_all(&s, "\n").into_owned();
  }
  if let Ok(re) = Regex::new(r"(?is)<[^>]+>") {
    s = re.replace_all(&s, " ").into_owned();
  }
  // entities (minimal)
  s = s
    .replace("&nbsp;", " ")
    .replace("&amp;", "&")
    .replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&quot;", "\"")
    .replace("&#39;", "'");
  if let Ok(re) = Regex::new(r"[ \t\x0b\f\r]+") {
    s = re.replace_all(&s, " ").into_owned();
  }
  if let Ok(re) = Regex::new(r"\n{3,}") {
    s = re.replace_all(&s, "\n\n").into_owned();
  }
  s.trim().to_string()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn strips_tags() {
    let t = html_to_text("<html><script>x()</script><p>Hello <b>world</b></p></html>");
    assert!(t.contains("Hello"));
    assert!(t.contains("world"));
    assert!(!t.contains("script"));
  }
}
