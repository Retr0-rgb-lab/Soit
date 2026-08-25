//! HTML → clean text/markdown for LLM consumers of the Soit MCP.
//!
//! `ai_html` is stored as the *rendered* output of
//! `src/lib/chat/assistantHtml.ts` (KaTeX SVG, MathML, mark spans, tables,
//! mermaid placeholders). LLMs only want the semantic content: original LaTeX,
//! table pipes, code fences — not SVG paths. This module reverses that closed,
//! known tag set back to text / markdown.
//!
//! Only the tag set produced by `assistantHtml.ts` + `tex.ts` is handled.
//! Unknown tags contribute their text content (never their markup).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextMode {
  Text,
  Markdown,
}

#[derive(Debug, Clone, PartialEq)]
enum Tok {
  Text(String),
  Open {
    tag: String,
    attrs: Vec<(String, String)>,
    self_closing: bool,
  },
  Close {
    tag: String,
  },
}

/// Convert rendered assistant HTML (`ai_html`) to clean text or markdown.
pub fn ai_html_to_clean(html: &str, mode: TextMode) -> String {
  let toks = tokenize(html);
  let mut ctx = Ctx {
    toks: &toks,
    pos: 0,
    mode,
    out: String::new(),
  };
  ctx.render_blocks();
  postprocess(&ctx.out)
}

/// Entity decode in `tex.rs::htmlUnescape` order — `&amp;` LAST so that
/// `&amp;lt;` (literal `&lt;`) does not double-decode into `<`.
pub fn html_unescape(s: &str) -> String {
  let mut out = s.replace("&lt;", "<");
  out = out.replace("&gt;", ">");
  out = out.replace("&quot;", "\"");
  out = out.replace("&#39;", "'");
  out = decode_numeric(&out);
  out.replace("&amp;", "&")
}

/// Decode decimal `&#NNN;` and hex `&#xHH;` numeric character references.
fn decode_numeric(s: &str) -> String {
  let mut out = String::with_capacity(s.len());
  let mut rest = s;
  while !rest.is_empty() {
    match rest.find("&#") {
      None => {
        out.push_str(rest);
        break;
      }
      Some(pos) => {
        out.push_str(&rest[..pos]);
        let after = &rest[pos..];
        // Find the terminating ';'.
        let Some(rel_end) = after.find(';') else {
          out.push_str(after);
          break;
        };
        let body = &after[2..rel_end];
        let code = if let Some(hex) = body.strip_prefix('x').or_else(|| body.strip_prefix('X')) {
          u32::from_str_radix(hex, 16).ok()
        } else {
          body.parse::<u32>().ok()
        };
        if let Some(c) = code.and_then(char::from_u32) {
          out.push(c);
          rest = &after[rel_end + 1..];
        } else {
          // Not a valid numeric ref — emit `&#` literally and continue after it.
          out.push_str("&#");
          rest = &after[2..];
        }
      }
    }
  }
  out
}

fn postprocess(s: &str) -> String {
  let mut out = String::with_capacity(s.len());
  let mut blank_run = 0usize;
  for line in s.lines() {
    let trimmed = line.trim_end();
    if trimmed.trim().is_empty() {
      blank_run += 1;
      if blank_run <= 1 {
        out.push('\n');
      }
    } else {
      blank_run = 0;
      out.push_str(trimmed);
      out.push('\n');
    }
  }
  out.trim().to_string()
}

// ---- tokenizer -----------------------------------------------------------

fn tokenize(html: &str) -> Vec<Tok> {
  let mut toks = Vec::new();
  let mut rest = html;
  while !rest.is_empty() {
    match rest.find('<') {
      None => {
        toks.push(Tok::Text(rest.to_string()));
        break;
      }
      Some(pos) => {
        if pos > 0 {
          toks.push(Tok::Text(rest[..pos].to_string()));
        }
        let after = &rest[pos..];
        if let Some(stripped) = after.strip_prefix("</") {
          let end = stripped.find('>').unwrap_or(stripped.len());
          let tag = stripped[..end].trim().to_ascii_lowercase();
          toks.push(Tok::Close { tag });
          rest = if end < stripped.len() { &stripped[end + 1..] } else { "" };
        } else if after.starts_with("<!") || after.starts_with("<?") {
          let end = after.find('>').unwrap_or(after.len());
          rest = if end < after.len() { &after[end + 1..] } else { "" };
        } else {
          let (tok, consumed) = parse_open_tag(after);
          toks.push(tok);
          rest = &after[consumed..];
        }
      }
    }
  }
  toks
}

fn parse_open_tag(after: &str) -> (Tok, usize) {
  let bytes = after.as_bytes();
  let mut i = 1; // skip '<'
  let name_start = i;
  while i < bytes.len()
    && !bytes[i].is_ascii_whitespace()
    && bytes[i] != b'>'
    && bytes[i] != b'/'
  {
    i += 1;
  }
  let tag = after[name_start..i].to_ascii_lowercase();
  let mut attrs: Vec<(String, String)> = Vec::new();
  let mut self_closing = false;

  loop {
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
      i += 1;
    }
    if i >= bytes.len() {
      break;
    }
    if bytes[i] == b'>' {
      i += 1;
      break;
    }
    if bytes[i] == b'/' {
      if i + 1 < bytes.len() && bytes[i + 1] == b'>' {
        self_closing = true;
        i += 2;
      } else {
        i += 1;
      }
      break;
    }
    let an_start = i;
    while i < bytes.len()
      && bytes[i] != b'='
      && !bytes[i].is_ascii_whitespace()
      && bytes[i] != b'>'
      && bytes[i] != b'/'
    {
      i += 1;
    }
    let aname = after[an_start..i].to_ascii_lowercase();
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
      i += 1;
    }
    let mut aval = String::new();
    if i < bytes.len() && bytes[i] == b'=' {
      i += 1;
      while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
      }
      if i < bytes.len() && (bytes[i] == b'"' || bytes[i] == b'\'') {
        let quote = bytes[i];
        i += 1;
        let vs = i;
        while i < bytes.len() && bytes[i] != quote {
          i += 1;
        }
        aval = after[vs..i].to_string();
        if i < bytes.len() {
          i += 1;
        }
      } else {
        let vs = i;
        while i < bytes.len()
          && !bytes[i].is_ascii_whitespace()
          && bytes[i] != b'>'
          && bytes[i] != b'/'
        {
          i += 1;
        }
        aval = after[vs..i].to_string();
      }
    }
    attrs.push((aname, aval));
  }

  (
    Tok::Open {
      tag,
      attrs,
      self_closing,
    },
    i,
  )
}

// ---- renderer ------------------------------------------------------------

struct Ctx<'a> {
  toks: &'a [Tok],
  pos: usize,
  mode: TextMode,
  out: String,
}

fn get_attr<'x>(attrs: &'x [(String, String)], name: &str) -> Option<&'x str> {
  attrs
    .iter()
    .find(|(n, _)| n == name)
    .map(|(_, v)| v.as_str())
}

fn has_class(attrs: &[(String, String)], cls: &str) -> bool {
  get_attr(attrs, "class")
    .map(|c| c.split_whitespace().any(|x| x == cls))
    .unwrap_or(false)
}

fn class_contains(attrs: &[(String, String)], needle: &str) -> bool {
  get_attr(attrs, "class")
    .map(|c| c.split_whitespace().any(|x| x.contains(needle)))
    .unwrap_or(false)
}

fn is_discard(tag: &str, attrs: &[(String, String)]) -> bool {
  tag == "svg" || tag == "math" || class_contains(attrs, "katex")
}

impl<'a> Ctx<'a> {
  fn peek(&self) -> Option<&'a Tok> {
    self.toks.get(self.pos)
  }

  fn render_blocks(&mut self) {
    while let Some(tok) = self.peek() {
      match tok {
        Tok::Open { tag, attrs, .. } if tag == "p" => {
          self.pos += 1;
          let text = self.render_inline_until("p");
          self.push_block(&text);
        }
        Tok::Open { tag, .. }
          if tag == "h1" || tag == "h2" || tag == "h3" || tag == "h4" || tag == "h5" || tag == "h6" =>
        {
          let level = tag.as_bytes()[1] as usize - b'0' as usize;
          self.pos += 1;
          let text = self.render_inline_until(tag);
          self.push_heading(level, &text);
        }
        Tok::Open { tag, .. } if tag == "ul" || tag == "ol" => {
          let kind = tag.clone();
          self.render_list(&kind);
        }
        Tok::Open { tag, .. } if tag == "blockquote" => {
          self.render_blockquote();
        }
        Tok::Open { tag, attrs, .. } if tag == "div" && has_class(attrs, "ai-table-wrap") => {
          self.render_table_wrap();
        }
        Tok::Open { tag, attrs, .. } if tag == "div" && has_class(attrs, "soit-mermaid") => {
          self.render_mermaid();
        }
        Tok::Open { tag, attrs, .. } if tag == "div" && class_contains(attrs, "soit-math") => {
          self.render_math_block(attrs);
        }
        Tok::Open { tag, .. } if tag == "table" => {
          self.render_table();
        }
        Tok::Open { tag, .. } if tag == "pre" => {
          self.render_pre();
        }
        Tok::Open { tag, attrs, .. } if is_discard(tag, attrs) => {
          self.discard_element();
        }
        Tok::Text(text) => {
          let s = html_unescape(text);
          if !s.trim().is_empty() {
            self.push_block(&s);
          }
          self.pos += 1;
        }
        // Stray close or unknown block-level open: skip and carry on.
        _ => self.pos += 1,
      }
    }
  }

  fn push_block(&mut self, text: &str) {
    let t = text.trim();
    if !t.is_empty() {
      self.out.push_str(t);
      self.out.push_str("\n\n");
    }
  }

  fn push_heading(&mut self, level: usize, text: &str) {
    let t = text.trim();
    if self.mode == TextMode::Markdown {
      self.out.push_str(&"#".repeat(level.min(6)));
      self.out.push(' ');
      self.out.push_str(t);
    } else {
      self.out.push_str(t);
    }
    self.out.push_str("\n\n");
  }

  /// Consume tokens until the matching close of `stop` (exclusive), rendering
  /// inline content. Block-level tags are treated as plain text inside inline
  /// context (should not occur in the closed set).
  fn render_inline_until(&mut self, stop: &str) -> String {
    let mut s = String::new();
    while let Some(tok) = self.peek() {
      match tok {
        Tok::Close { tag } if tag == stop => {
          self.pos += 1;
          break;
        }
        Tok::Text(text) => {
          s.push_str(&html_unescape(text));
          self.pos += 1;
        }
        Tok::Open { tag, .. } if tag == "br" => {
          s.push('\n');
          self.pos += 1;
        }
        Tok::Open { tag, .. } if tag == "strong" || tag == "b" => {
          self.pos += 1;
          let inner = self.render_inline_until(tag);
          if self.mode == TextMode::Markdown {
            s.push_str("**");
            s.push_str(&inner);
            s.push_str("**");
          } else {
            s.push_str(&inner);
          }
        }
        Tok::Open { tag, .. } if tag == "em" || tag == "i" => {
          self.pos += 1;
          let inner = self.render_inline_until(tag);
          if self.mode == TextMode::Markdown {
            s.push('*');
            s.push_str(&inner);
            s.push('*');
          } else {
            s.push_str(&inner);
          }
        }
        Tok::Open { tag, attrs, .. } if tag == "code" && class_contains(attrs, "soit-math-fallback") => {
          self.pos += 1;
          let tex = self.render_inline_until("code").trim().to_string();
          if self.mode == TextMode::Markdown {
            s.push('`');
            s.push_str(&tex);
            s.push('`');
          } else {
            s.push_str(&tex);
          }
        }
        Tok::Open { tag, .. } if tag == "code" => {
          self.pos += 1;
          let inner = self.render_inline_until("code");
          if self.mode == TextMode::Markdown {
            s.push('`');
            s.push_str(&inner);
            s.push('`');
          } else {
            s.push_str(&inner);
          }
        }
        Tok::Open { tag, attrs, .. } if tag == "span" && has_class(attrs, "mark") => {
          self.pos += 1;
          let inner = self.render_inline_until("span");
          s.push_str(&inner);
        }
        Tok::Open { tag, attrs, .. } if tag == "span" && has_class(attrs, "ai-link") => {
          self.pos += 1;
          let inner = self.render_inline_until("span");
          s.push_str(&inner);
        }
        Tok::Open { tag, attrs, .. } if tag == "span" && class_contains(attrs, "soit-math") => {
          let tex = get_attr(attrs, "data-tex").map(html_unescape);
          self.discard_element();
          if let Some(tex) = tex {
            s.push('$');
            s.push_str(tex.trim());
            s.push('$');
          }
        }
        Tok::Open { tag, attrs, .. } if is_discard(tag, attrs) => {
          self.discard_element();
        }
        // Unknown inline tag: drop the tag, keep its text via later Text tokens.
        Tok::Close { .. } => self.pos += 1,
        Tok::Open { .. } => self.pos += 1,
      }
    }
    s
  }

  fn render_list(&mut self, kind: &str) {
    self.pos += 1; // consume <ul>/<ol>
    let mut idx = 0usize;
    while let Some(tok) = self.peek() {
      match tok {
        Tok::Open { tag, .. } if tag == "li" => {
          self.pos += 1;
          let text = self.render_inline_until("li");
          idx += 1;
          let marker = match (kind, self.mode) {
            ("ol", TextMode::Markdown) => format!("{idx}. "),
            _ => "- ".to_string(),
          };
          self.out.push_str(&marker);
          self.out.push_str(text.trim());
          self.out.push('\n');
        }
        Tok::Close { tag } if tag == kind => {
          self.pos += 1;
          break;
        }
        _ => self.pos += 1,
      }
    }
    self.out.push('\n');
  }

  fn render_blockquote(&mut self) {
    self.pos += 1; // consume <blockquote>
    let text = self.render_inline_until("blockquote");
    for line in text.split('\n') {
      self.out.push_str("> ");
      self.out.push_str(line.trim_end());
      self.out.push('\n');
    }
    self.out.push('\n');
  }

  fn render_pre(&mut self) {
    self.pos += 1; // consume <pre>
    let mut code = String::new();
    while let Some(tok) = self.peek() {
      match tok {
        Tok::Close { tag } if tag == "pre" => {
          self.pos += 1;
          break;
        }
        Tok::Open { tag, .. } if tag == "code" => self.pos += 1,
        Tok::Close { tag } if tag == "code" => self.pos += 1,
        Tok::Text(text) => {
          code.push_str(&html_unescape(text));
          self.pos += 1;
        }
        _ => self.pos += 1,
      }
    }
    if self.mode == TextMode::Markdown {
      self.out.push_str("```\n");
      self.out.push_str(code.trim_end());
      self.out.push_str("\n```\n\n");
    } else {
      self.out.push_str(code.trim());
      self.out.push_str("\n\n");
    }
  }

  fn render_mermaid(&mut self) {
    self.pos += 1; // consume <div class="soit-mermaid">
    let mut code = String::new();
    while let Some(tok) = self.peek() {
      match tok {
        Tok::Close { tag } if tag == "div" => {
          self.pos += 1;
          break;
        }
        Tok::Text(text) => {
          code.push_str(&html_unescape(text));
          self.pos += 1;
        }
        _ => self.pos += 1,
      }
    }
    if self.mode == TextMode::Markdown {
      self.out.push_str("```mermaid\n");
      self.out.push_str(code.trim());
      self.out.push_str("\n```\n\n");
    } else {
      self.out.push_str(code.trim());
      self.out.push_str("\n\n");
    }
  }

  fn render_math_block(&mut self, attrs: &[(String, String)]) {
    let tex = get_attr(attrs, "data-tex").map(html_unescape);
    self.discard_element(); // consume <div class="soit-math-block"> … </div>
    if let Some(tex) = tex {
      self.out.push_str("$$\n");
      self.out.push_str(tex.trim());
      self.out.push_str("\n$$\n\n");
    }
  }

  fn render_table_wrap(&mut self) {
    self.pos += 1; // consume <div class="ai-table-wrap">
    while let Some(tok) = self.peek() {
      match tok {
        Tok::Open { tag, .. } if tag == "table" => {
          self.pos += 1;
          self.render_table_rows();
          break;
        }
        Tok::Close { tag } if tag == "div" => {
          self.pos += 1;
          return;
        }
        _ => self.pos += 1,
      }
    }
    // Consume any trailing tokens up to the wrapper close.
    while let Some(tok) = self.peek() {
      match tok {
        Tok::Close { tag } if tag == "div" => {
          self.pos += 1;
          break;
        }
        _ => self.pos += 1,
      }
    }
  }

  fn render_table(&mut self) {
    self.pos += 1; // consume <table>
    self.render_table_rows();
  }

  fn render_table_rows(&mut self) {
    let mut rows: Vec<Vec<String>> = Vec::new();
    while let Some(tok) = self.peek() {
      match tok {
        Tok::Close { tag } if tag == "table" => {
          self.pos += 1;
          break;
        }
        Tok::Open { tag, .. } if tag == "tr" => {
          self.pos += 1;
          let mut cells = Vec::new();
          while let Some(t2) = self.peek() {
            match t2 {
              Tok::Close { tag } if tag == "tr" => {
                self.pos += 1;
                break;
              }
              Tok::Open { tag, .. } if tag == "th" || tag == "td" => {
                let cell_tag = tag.clone();
                self.pos += 1;
                let txt = self.render_inline_until(&cell_tag);
                cells.push(txt.trim().to_string());
              }
              _ => self.pos += 1,
            }
          }
          rows.push(cells);
        }
        _ => self.pos += 1,
      }
    }

    if rows.is_empty() {
      return;
    }
    let col_count = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    if col_count == 0 {
      return;
    }
    let render_row = |r: &[String]| -> String {
      let mut padded = vec![String::new(); col_count];
      for (i, c) in r.iter().enumerate() {
        padded[i] = c.clone();
      }
      format!("| {} |", padded.join(" | "))
    };

    self.out.push_str(&render_row(&rows[0]));
    self.out.push('\n');
    let sep = vec!["---".to_string(); col_count];
    self.out.push_str(&format!("| {} |", sep.join(" | ")));
    self.out.push('\n');
    for r in &rows[1..] {
      self.out.push_str(&render_row(r));
      self.out.push('\n');
    }
    self.out.push('\n');
  }

  fn discard_element(&mut self) {
    let mut depth = 0i32;
    loop {
      if self.pos >= self.toks.len() {
        break;
      }
      match &self.toks[self.pos] {
        Tok::Open { self_closing, .. } => {
          self.pos += 1;
          if *self_closing {
            if depth == 0 {
              break;
            }
          } else {
            depth += 1;
          }
        }
        Tok::Close { .. } => {
          depth -= 1;
          self.pos += 1;
          if depth <= 0 {
            break;
          }
        }
        Tok::Text(_) => self.pos += 1,
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn md(html: &str) -> String {
    ai_html_to_clean(html, TextMode::Markdown)
  }
  fn txt(html: &str) -> String {
    ai_html_to_clean(html, TextMode::Text)
  }

  #[test]
  fn inline_math_restores_tex() {
    assert_eq!(
      txt("<p>see <span class=\"soit-math soit-math-inline\" data-tex=\"x&lt;y\">KATEX</span> now</p>"),
      "see $x<y$ now"
    );
  }

  #[test]
  fn block_math_is_own_line() {
    assert_eq!(
      md("<div class=\"soit-math soit-math-block\" data-tex=\"\\frac{1}{2}\">KATEX</div>"),
      "$$\n\\frac{1}{2}\n$$"
    );
  }

  #[test]
  fn data_tex_amp_lt_is_unescaped_to_literal() {
    // data-tex holds attrEscape(tex): a raw `&lt;` in tex becomes `&amp;lt;`.
    assert_eq!(
      txt("<p><span class=\"soit-math soit-math-inline\" data-tex=\"a&amp;lt;b\">K</span></p>"),
      "$a&lt;b$"
    );
  }

  #[test]
  fn svg_and_mathml_are_discarded() {
    let html = "<p>before</p><svg><path d=\"M0\"/></svg><math><mrow><mi>x</mi></mrow></math><p>after</p>";
    assert_eq!(txt(html), "before\n\nafter");
  }

  #[test]
  fn katex_shell_is_discarded() {
    assert_eq!(
      txt("<p><span class=\"katex\">noise<span class=\"katex-mathml\">m</span></span>ok</p>"),
      "ok"
    );
  }

  #[test]
  fn mark_keeps_term_text() {
    assert_eq!(
      txt("<p>see <span class=\"mark\" data-term=\"函子\" data-mark-id=\"函子\">函子</span> here</p>"),
      "see 函子 here"
    );
  }

  #[test]
  fn entity_amp_last_prevents_double_decode() {
    assert_eq!(html_unescape("&amp;lt;"), "&lt;");
    assert_eq!(html_unescape("&lt;"), "<");
    assert_eq!(html_unescape("&amp;amp;"), "&amp;");
  }

  #[test]
  fn numeric_entity_decodes() {
    assert_eq!(html_unescape("&#39;"), "'");
    assert_eq!(html_unescape("&#65;"), "A");
    assert_eq!(html_unescape("&#x1F600;"), "😀");
  }

  #[test]
  fn gfm_table_to_pipe() {
    let html = "<div class=\"ai-table-wrap\"><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div>";
    assert_eq!(txt(html), "| A | B |\n| --- | --- |\n| 1 | 2 |");
  }

  #[test]
  fn mermaid_source_unescaped_in_fence() {
    let html = "<div class=\"soit-mermaid\">graph TD\nA--&gt;B</div>";
    assert_eq!(md(html), "```mermaid\ngraph TD\nA-->B\n```");
  }

  #[test]
  fn pre_code_fence() {
    assert_eq!(
      md("<pre><code>fn main() {}\nprintln!(\"hi\");</code></pre>"),
      "```\nfn main() {}\nprintln!(\"hi\");\n```"
    );
  }

  #[test]
  fn inline_code_backtick() {
    assert_eq!(md("<p>use <code>let x = 1</code> here</p>"), "use `let x = 1` here");
    assert_eq!(txt("<p>use <code>let x = 1</code> here</p>"), "use let x = 1 here");
  }

  #[test]
  fn headings_levels() {
    assert_eq!(md("<h1>A</h1><h2>B</h2><h3>C</h3>"), "# A\n\n## B\n\n### C");
    assert_eq!(txt("<h1>A</h1>"), "A");
  }

  #[test]
  fn lists_ul_and_ol() {
    assert_eq!(md("<ul><li>a</li><li>b</li></ul>"), "- a\n- b");
    assert_eq!(md("<ol><li>a</li><li>b</li></ol>"), "1. a\n2. b");
    assert_eq!(txt("<ol><li>a</li><li>b</li></ol>"), "- a\n- b");
  }

  #[test]
  fn emphasis_strong_em() {
    assert_eq!(md("<p><strong>bold</strong> and <em>it</em></p>"), "**bold** and *it*");
    assert_eq!(txt("<p><strong>bold</strong></p>"), "bold");
  }

  #[test]
  fn blockquote_lines() {
    assert_eq!(txt("<blockquote>line1<br>line2</blockquote>"), "> line1\n> line2");
  }

  #[test]
  fn ai_link_label_only() {
    assert_eq!(txt("<p>see <span class=\"ai-link\">docs</span></p>"), "see docs");
  }

  #[test]
  fn math_fallback_code() {
    assert_eq!(md("<p><code class=\"soit-math-fallback\">x&lt;y</code></p>"), "`x<y`");
    assert_eq!(txt("<p><code class=\"soit-math-fallback\">x&lt;y</code></p>"), "x<y");
  }

  #[test]
  fn unknown_tag_keeps_text() {
    assert_eq!(txt("<p>a<foo>b</foo>c</p>"), "abc");
  }

  #[test]
  fn apostrophe_entity() {
    assert_eq!(txt("<p>it&#39;s</p>"), "it's");
  }

  #[test]
  fn consecutive_blank_lines_collapsed() {
    let out = md("<h1>A</h1><p></p><h1>B</h1>");
    assert!(!out.contains("\n\n\n"), "unexpected triple newline in {out:?}");
    assert_eq!(out, "# A\n\n# B");
  }

  #[test]
  fn unclosed_tag_is_tolerated() {
    assert_eq!(txt("<p>text"), "text");
  }

  #[test]
  fn missing_data_tex_math_dropped() {
    assert_eq!(txt("<p>a<span class=\"soit-math\">svg</span>b</p>"), "ab");
  }

  #[test]
  fn nested_strong_mark() {
    assert_eq!(
      md("<p><strong><span class=\"mark\" data-term=\"t\" data-mark-id=\"t\">t</span></strong></p>"),
      "**t**"
    );
  }
}
