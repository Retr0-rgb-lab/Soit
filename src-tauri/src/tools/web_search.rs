//! Web search backends: off / DuckDuckGo HTML / Tavily.

use super::prefs::{ToolsPrefsDto, WebSearchBackend};
use regex::Regex;
use serde_json::{json, Value};
use std::time::Duration;

const TIMEOUT_SECS: u64 = 12;
const MAX_HITS: usize = 8;
const MAX_SNIPPET: usize = 280;

pub fn web_search(query: &str, prefs: &ToolsPrefsDto) -> Result<(String, String, String), String> {
  let q = query.trim();
  if q.is_empty() {
    return Err("query is empty".into());
  }
  if q.chars().count() > 200 {
    return Err("query too long".into());
  }

  match prefs.web_search_backend {
    WebSearchBackend::Off => Err(
      "网页搜索已关闭。可在设置 → 工具 中启用 DuckDuckGo 或 Tavily，或改用 vault_search / fetch_url。"
        .into(),
    ),
    WebSearchBackend::Ddg => search_ddg(q),
    WebSearchBackend::Tavily => {
      if prefs.tavily_api_key.trim().is_empty() {
        return Err("Tavily API Key 未配置。请在设置 → 工具 中填写。".into());
      }
      search_tavily(q, prefs.tavily_api_key.trim())
    }
  }
}

fn search_ddg(q: &str) -> Result<(String, String, String), String> {
  let client = reqwest::blocking::Client::builder()
    .timeout(Duration::from_secs(TIMEOUT_SECS))
    .redirect(reqwest::redirect::Policy::limited(3))
    .user_agent("SoitHost/1.0 (+local inquiry tools)")
    .build()
    .map_err(|e| format!("http client: {e}"))?;

  let resp = client
    .post("https://html.duckduckgo.com/html/")
    .header("Content-Type", "application/x-www-form-urlencoded")
    .body(format!("q={}", urlencoding_basic(q)))
    .send()
    .map_err(|e| format!("DDG request failed: {e}"))?;

  if !resp.status().is_success() {
    return Err(format!("DDG HTTP {}", resp.status()));
  }
  let html = resp.text().map_err(|e| format!("DDG body: {e}"))?;
  let hits = parse_ddg_html(&html);
  if hits.is_empty() {
    return Err("DuckDuckGo 未解析到结果（页面结构可能变更或被拦截）".into());
  }
  let content = serde_json::to_string_pretty(&json!({ "query": q, "hits": hits }))
    .unwrap_or_else(|_| "[]".into());
  let summary = format!("{} 条结果", hits.len());
  Ok(("网页搜索 (DuckDuckGo)".into(), summary, content))
}

fn parse_ddg_html(html: &str) -> Vec<Value> {
  let mut hits = Vec::new();
  // result__a href + text; result__snippet
  let re_a = Regex::new(
    r#"(?s)class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>"#,
  )
  .ok();
  let re_snip = Regex::new(r#"(?s)class="result__snippet"[^>]*>(.*?)</"#).ok();

  let Some(re_a) = re_a else {
    return hits;
  };

  let mut snips: Vec<String> = Vec::new();
  if let Some(re_s) = re_snip {
    for cap in re_s.captures_iter(html) {
      snips.push(strip_tags(&cap[1]));
    }
  }

  for (i, cap) in re_a.captures_iter(html).enumerate() {
    if hits.len() >= MAX_HITS {
      break;
    }
    let href = decode_ddg_href(&cap[1]);
    let title = strip_tags(&cap[2]);
    if title.is_empty() || href.is_empty() {
      continue;
    }
    let snippet = snips
      .get(i)
      .cloned()
      .unwrap_or_default()
      .chars()
      .take(MAX_SNIPPET)
      .collect::<String>();
    hits.push(json!({
      "title": title.chars().take(200).collect::<String>(),
      "url": href,
      "snippet": snippet,
    }));
  }
  hits
}

fn decode_ddg_href(href: &str) -> String {
  // //duckduckgo.com/l/?uddg=https%3A%2F%2F...
  if let Some(idx) = href.find("uddg=") {
    let enc = &href[idx + 5..];
    let enc = enc.split('&').next().unwrap_or(enc);
    return url_decode(enc);
  }
  if href.starts_with("http") {
    return href.to_string();
  }
  if href.starts_with("//") {
    return format!("https:{href}");
  }
  href.to_string()
}

fn search_tavily(q: &str, api_key: &str) -> Result<(String, String, String), String> {
  let client = reqwest::blocking::Client::builder()
    .timeout(Duration::from_secs(TIMEOUT_SECS))
    .build()
    .map_err(|e| format!("http client: {e}"))?;

  let body = json!({
    "api_key": api_key,
    "query": q,
    "max_results": MAX_HITS,
    "include_answer": false,
  });

  let resp = client
    .post("https://api.tavily.com/search")
    .json(&body)
    .send()
    .map_err(|e| format!("Tavily request failed: {e}"))?;

  if !resp.status().is_success() {
    let status = resp.status();
    let t = resp.text().unwrap_or_default();
    return Err(format!("Tavily HTTP {status}: {}", t.chars().take(200).collect::<String>()));
  }

  let v: Value = resp
    .json()
    .map_err(|e| format!("Tavily json: {e}"))?;
  let mut hits = Vec::new();
  if let Some(arr) = v.get("results").and_then(|r| r.as_array()) {
    for r in arr.iter().take(MAX_HITS) {
      hits.push(json!({
        "title": r.get("title").and_then(|x| x.as_str()).unwrap_or(""),
        "url": r.get("url").and_then(|x| x.as_str()).unwrap_or(""),
        "snippet": r.get("content").and_then(|x| x.as_str()).unwrap_or("")
          .chars().take(MAX_SNIPPET).collect::<String>(),
      }));
    }
  }
  if hits.is_empty() {
    return Err("Tavily 无结果".into());
  }
  let content = serde_json::to_string_pretty(&json!({ "query": q, "hits": hits }))
    .unwrap_or_else(|_| "[]".into());
  Ok((
    "网页搜索 (Tavily)".into(),
    format!("{} 条结果", hits.len()),
    content,
  ))
}

fn strip_tags(s: &str) -> String {
  let re = Regex::new(r"<[^>]+>").ok();
  let t = if let Some(re) = re {
    re.replace_all(s, "").into_owned()
  } else {
    s.to_string()
  };
  html_unescape(&t).split_whitespace().collect::<Vec<_>>().join(" ")
}

fn html_unescape(s: &str) -> String {
  s.replace("&amp;", "&")
    .replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&quot;", "\"")
    .replace("&#39;", "'")
    .replace("&nbsp;", " ")
}

fn urlencoding_basic(s: &str) -> String {
  let mut out = String::new();
  for b in s.as_bytes() {
    match *b {
      b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
        out.push(*b as char)
      }
      b' ' => out.push_str("+"),
      _ => out.push_str(&format!("%{b:02X}")),
    }
  }
  out
}

fn url_decode(s: &str) -> String {
  let bytes = s.as_bytes();
  let mut out = Vec::new();
  let mut i = 0;
  while i < bytes.len() {
    match bytes[i] {
      b'+' => {
        out.push(b' ');
        i += 1;
      }
      b'%' if i + 2 < bytes.len() => {
        let h = u8::from_str_radix(
          std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("00"),
          16,
        )
        .unwrap_or(0);
        out.push(h);
        i += 3;
      }
      c => {
        out.push(c);
        i += 1;
      }
    }
  }
  String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn off_errors() {
    let prefs = ToolsPrefsDto::default();
    assert!(web_search("test", &prefs).is_err());
  }
}
