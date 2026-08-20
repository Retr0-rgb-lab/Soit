use super::sanitize::{yaml_escape, yaml_unescape_scalar};

/// Split optional YAML frontmatter from body.
pub fn split_frontmatter(raw: &str) -> (Option<String>, String) {
  let bytes = raw.as_bytes();
  if !raw.starts_with("---") {
    return (None, raw.to_string());
  }
  let after = if bytes.len() > 3 && bytes[3] == b'\r' {
    4
  } else {
    3
  };
  let rest = &raw[after..];
  let rest = rest.strip_prefix('\n').unwrap_or(rest);
  // find closing ---
  let mut search_from = 0usize;
  while let Some(rel) = rest[search_from..].find("---") {
    let abs = search_from + rel;
    let before_ok = abs == 0 || rest.as_bytes()[abs - 1] == b'\n';
    if !before_ok {
      search_from = abs + 3;
      continue;
    }
    let after_close = abs + 3;
    let fm = rest[..abs].trim_end_matches(['\r', '\n']).to_string();
    let body = rest[after_close..]
      .strip_prefix('\r')
      .unwrap_or(&rest[after_close..])
      .strip_prefix('\n')
      .unwrap_or(&rest[after_close..])
      .to_string();
    return (Some(fm), body);
  }
  (None, raw.to_string())
}

/// Parse `soit_card_ids` list from a simple YAML frontmatter block.
pub fn parse_card_ids(fm: &str) -> Vec<String> {
  let mut ids = Vec::new();
  let mut in_list = false;
  for line in fm.lines() {
    let t = line.trim();
    if t.starts_with("soit_card_ids:") {
      let rest = t["soit_card_ids:".len()..].trim();
      if rest.starts_with('[') && rest.ends_with(']') {
        let inner = &rest[1..rest.len() - 1];
        for part in split_flow_seq(inner) {
          let id = yaml_unescape_scalar(&part);
          if !id.is_empty() {
            ids.push(id);
          }
        }
        in_list = false;
      } else if rest.is_empty() {
        in_list = true;
      }
      continue;
    }
    if in_list {
      if let Some(item) = t.strip_prefix('-') {
        let id = yaml_unescape_scalar(item.trim());
        if !id.is_empty() {
          ids.push(id);
        }
      } else if !t.is_empty() && !t.starts_with('#') {
        in_list = false;
      }
    }
  }
  ids
}

fn split_flow_seq(inner: &str) -> Vec<String> {
  let mut parts = Vec::new();
  let mut cur = String::new();
  let mut in_dq = false;
  let mut in_sq = false;
  let mut escape = false;
  for ch in inner.chars() {
    if escape {
      cur.push(ch);
      escape = false;
      continue;
    }
    if in_dq {
      if ch == '\\' {
        cur.push(ch);
        escape = true;
      } else if ch == '"' {
        cur.push(ch);
        in_dq = false;
      } else {
        cur.push(ch);
      }
      continue;
    }
    if in_sq {
      cur.push(ch);
      if ch == '\'' {
        in_sq = false;
      }
      continue;
    }
    match ch {
      '"' => {
        cur.push(ch);
        in_dq = true;
      }
      '\'' => {
        cur.push(ch);
        in_sq = true;
      }
      ',' => {
        parts.push(std::mem::take(&mut cur));
      }
      _ => cur.push(ch),
    }
  }
  if !cur.trim().is_empty() {
    parts.push(cur);
  }
  parts
}

pub fn merge_card_ids(existing: &[String], card_id: &str) -> Vec<String> {
  let mut out = existing.to_vec();
  if !out.iter().any(|id| id == card_id) {
    out.push(card_id.to_string());
  }
  out
}

fn format_card_ids_block(card_ids: &[String]) -> String {
  let mut s = String::from("soit_card_ids:\n");
  for id in card_ids {
    s.push_str("  - ");
    s.push_str(&yaml_escape(id));
    s.push('\n');
  }
  s
}

/// Rebuild frontmatter: preserve unknown keys; upsert `soit_card_ids` + `soit_managed`.
pub fn merge_frontmatter(existing_fm: Option<&str>, card_ids: &[String]) -> String {
  let mut out = String::from("---\n");
  let mut saw_card_ids = false;
  let mut saw_managed = false;

  if let Some(fm) = existing_fm {
    let mut skip_list_items = false;
    for line in fm.lines() {
      let t = line.trim();

      if skip_list_items {
        if t.starts_with('-') {
          continue;
        }
        // blank lines inside a block list are dropped with the list
        if t.is_empty() {
          continue;
        }
        if t.starts_with('#') {
          continue;
        }
        skip_list_items = false;
      }

      if t.starts_with("soit_card_ids:") {
        let rest = t["soit_card_ids:".len()..].trim();
        // block form → skip following `-` items; flow form is one line
        skip_list_items = rest.is_empty();
        out.push_str(&format_card_ids_block(card_ids));
        saw_card_ids = true;
        continue;
      }

      if t.starts_with("soit_managed:") {
        out.push_str("soit_managed: true\n");
        saw_managed = true;
        continue;
      }

      out.push_str(line);
      out.push('\n');
    }
  }

  if !saw_card_ids {
    out.push_str(&format_card_ids_block(card_ids));
  }
  if !saw_managed {
    out.push_str("soit_managed: true\n");
  }
  out.push_str("---\n");
  out
}

/// Compose full file text: merged FM + body (body may be empty).
pub fn compose_with_body(existing_fm: Option<&str>, card_ids: &[String], body: &str) -> String {
  let mut out = merge_frontmatter(existing_fm, card_ids);
  if !body.is_empty() {
    if !body.starts_with('\n') && !out.ends_with('\n') {
      out.push('\n');
    }
    out.push_str(body);
    if !body.ends_with('\n') {
      out.push('\n');
    }
  }
  out
}
