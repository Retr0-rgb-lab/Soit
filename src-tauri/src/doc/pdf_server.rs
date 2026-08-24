//! Vault PDF preview server (PEL-156 P1) — 127.0.0.1 loopback only.
//! Per-vault random token; GET/HEAD + single Range; sandbox via resolve_under_vault.
//! No new Cargo deps: std::net + url (already a dependency).

use std::io::{Read, Seek, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use super::{probe_kind, resolve_under_vault, DocKind};

const MAX_HEAD_BYTES: usize = 8 * 1024;

pub struct PdfServerHandle {
  pub port: u16,
  pub token: String,
  pub vault_canon: PathBuf,
  listener: TcpListener,
  shutdown: Arc<AtomicBool>,
}

/// Parse a single-range `Range: bytes=...` header → inclusive (start, end).
/// Multi-range / malformed / unsatisfiable → None (caller serves full 200).
pub fn parse_single_range(header: Option<&str>, file_len: u64) -> Option<(u64, u64)> {
  let h = header?.trim();
  let spec = h.strip_prefix("bytes=")?;
  if spec.contains(',') {
    return None;
  }
  let (a, b) = spec.split_once('-')?;
  if a.is_empty() {
    // suffix: last n bytes
    let n: u64 = b.trim().parse().ok()?;
    if n == 0 || file_len == 0 {
      return None;
    }
    let start = file_len.saturating_sub(n);
    return Some((start, file_len - 1));
  }
  let start: u64 = a.trim().parse().ok()?;
  if start >= file_len {
    return None;
  }
  let end = if b.trim().is_empty() {
    file_len - 1
  } else {
    b.trim().parse::<u64>().ok()?.min(file_len - 1)
  };
  if end < start {
    return None;
  }
  Some((start, end))
}

fn new_token() -> String {
  use std::collections::hash_map::RandomState;
  use std::hash::{BuildHasher, Hasher};
  let nanos = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_nanos())
    .unwrap_or(0);
  let mut h1 = RandomState::new().build_hasher();
  h1.write_u128(nanos);
  let mut h2 = RandomState::new().build_hasher();
  h2.write_u128(nanos ^ 0x5a17_f00d_cafe_beef_u128);
  format!("{:016x}{:016x}", h1.finish(), h2.finish())
}

pub fn pdf_url(handle: &PdfServerHandle, path_rel: &str) -> String {
  let encoded: String = url::form_urlencoded::byte_serialize(path_rel.as_bytes()).collect();
  format!(
    "http://127.0.0.1:{}/doc?path={}&t={}",
    handle.port, encoded, handle.token
  )
}

pub fn start_pdf_server(vault_canon: PathBuf) -> Result<PdfServerHandle, String> {
  let listener =
    TcpListener::bind("127.0.0.1:0").map_err(|e| format!("pdf bind: {e}"))?;
  listener
    .set_nonblocking(true)
    .map_err(|e| format!("pdf nonblocking: {e}"))?;
  let port = listener
    .local_addr()
    .map_err(|e| format!("pdf addr: {e}"))?
    .port();
  let token = new_token();
  let shutdown = Arc::new(AtomicBool::new(false));
  let accept_loop = listener
    .try_clone()
    .map_err(|e| format!("pdf listener clone: {e}"))?;
  let handle = PdfServerHandle {
    port,
    token: token.clone(),
    vault_canon: vault_canon.clone(),
    listener, // handle owns the ORIGINAL listener; dropping the handle closes the port
    shutdown: shutdown.clone(),
  };
  std::thread::spawn(move || {
    loop {
      if shutdown.load(Ordering::Relaxed) {
        break;
      }
      match accept_loop.accept() {
        Ok((stream, _)) => {
          let vault = vault_canon.clone();
          let t = token.clone();
          std::thread::spawn(move || handle_connection(stream, &vault, &t));
        }
        Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
          std::thread::sleep(std::time::Duration::from_millis(50));
        }
        Err(_) => break,
      }
    }
  });
  Ok(handle)
}

impl Drop for PdfServerHandle {
  fn drop(&mut self) {
    // Signal the accept loop; it exits ≤50ms later, dropping its listener
    // clone — then the handle's own listener field closes the last socket
    // handle and frees the port.
    self.shutdown.store(true, Ordering::Relaxed);
  }
}

fn write_simple(stream: &mut TcpStream, code: u16, ctype: &str, body: &str) {
  let _ = write!(
    stream,
    "HTTP/1.1 {code} {reason}\r\nContent-Type: {ctype}\r\nContent-Length: {len}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
    reason = reason_phrase(code),
    len = body.len(),
  );
}

fn reason_phrase(code: u16) -> &'static str {
  match code {
    200 => "OK",
    206 => "Partial Content",
    400 => "Bad Request",
    403 => "Forbidden",
    404 => "Not Found",
    405 => "Method Not Allowed",
    416 => "Range Not Satisfiable",
    _ => "Error",
  }
}

fn write_pdf_head(
  stream: &mut TcpStream,
  code: u16,
  len: u64,
  content_range: Option<(u64, u64, u64)>,
) {
  let cr = match content_range {
    Some((start, end, total)) => format!("Content-Range: bytes {start}-{end}/{total}\r\n"),
    None => String::new(),
  };
  let _ = write!(
    stream,
    "HTTP/1.1 {code} {reason}\r\nContent-Type: application/pdf\r\nAccept-Ranges: bytes\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nContent-Length: {len}\r\n{cr}Connection: close\r\n\r\n",
    reason = reason_phrase(code),
  );
}

fn stream_file(stream: &mut TcpStream, file: &mut std::fs::File, mut remain: u64) {
  let mut buf = [0u8; 16 * 1024];
  while remain > 0 {
    let want = remain.min(buf.len() as u64) as usize;
    match file.read(&mut buf[..want]) {
      Ok(0) | Err(_) => break,
      Ok(n) => {
        if stream.write_all(&buf[..n]).is_err() {
          break;
        }
        remain -= n as u64;
      }
    }
  }
}

fn handle_connection(mut stream: TcpStream, vault_canon: &std::path::Path, token: &str) {
  let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(10)));
  let mut head = vec![0u8; MAX_HEAD_BYTES];
  let mut filled = 0usize;
  while filled < head.len() {
    match stream.read(&mut head[filled..]) {
      Ok(0) => return,
      Ok(n) => {
        filled += n;
        if head[..filled].windows(4).any(|w| w == b"\r\n\r\n") {
          break;
        }
      }
      Err(_) => return,
    }
  }
  let head_str = String::from_utf8_lossy(&head[..filled]);
  let mut lines = head_str.split("\r\n");
  let request_line = lines.next().unwrap_or("");
  let mut parts = request_line.split_whitespace();
  let method = parts.next().unwrap_or("");
  let target = parts.next().unwrap_or("");
  if method != "GET" && method != "HEAD" {
    write_simple(&mut stream, 405, "text/plain; charset=utf-8", "");
    return;
  }
  let range_header = lines
    .find_map(|l| {
      let lower = l.to_ascii_lowercase();
      lower
        .strip_prefix("range:")
        .map(|v| v.trim().to_string())
    });

  let Some(query) = target.strip_prefix("/doc?") else {
    write_simple(&mut stream, 404, "text/plain; charset=utf-8", "not found");
    return;
  };
  let mut path_opt: Option<String> = None;
  let mut token_opt: Option<String> = None;
  for (k, v) in url::form_urlencoded::parse(query.as_bytes()) {
    match k.as_ref() {
      "path" => path_opt = Some(v.into_owned()),
      "t" => token_opt = Some(v.into_owned()),
      _ => {}
    }
  }
  if token_opt.as_deref() != Some(token) {
    write_simple(&mut stream, 403, "text/plain; charset=utf-8", "forbidden");
    return;
  }
  let Some(path_rel) = path_opt else {
    write_simple(&mut stream, 400, "text/plain; charset=utf-8", "missing path");
    return;
  };
  let (abs, _) = match resolve_under_vault(vault_canon, &path_rel) {
    Ok(v) => v,
    Err(_) => {
      write_simple(&mut stream, 404, "text/plain; charset=utf-8", "not found");
      return;
    }
  };
  if probe_kind(&abs) != DocKind::Pdf {
    write_simple(&mut stream, 404, "text/plain; charset=utf-8", "not found");
    return;
  }
  let mut file = match std::fs::File::open(&abs) {
    Ok(f) => f,
    Err(_) => {
      write_simple(&mut stream, 404, "text/plain; charset=utf-8", "not found");
      return;
    }
  };
  let len = file.metadata().map(|m| m.len()).unwrap_or(0);
  match parse_single_range(range_header.as_deref(), len) {
    Some((start, end)) => {
      write_pdf_head(&mut stream, 206, end - start + 1, Some((start, end, len)));
      if method == "HEAD" {
        return;
      }
      if file.seek(std::io::SeekFrom::Start(start)).is_ok() {
        stream_file(&mut stream, &mut file, end - start + 1);
      }
    }
    None => {
      write_pdf_head(&mut stream, 200, len, None);
      if method == "HEAD" {
        return;
      }
      stream_file(&mut stream, &mut file, len);
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::time::{SystemTime, UNIX_EPOCH};

  fn temp_vault(label: &str) -> PathBuf {
    let ms = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map(|d| d.as_millis())
      .unwrap_or(0);
    let dir = std::env::temp_dir().join(format!("soit_pdf_{label}_{ms}"));
    std::fs::create_dir_all(&dir).unwrap();
    dunce::canonicalize(&dir).unwrap()
  }

  fn write_file(path: &PathBuf, bytes: &[u8]) {
    if let Some(parent) = path.parent() {
      std::fs::create_dir_all(parent).unwrap();
    }
    let mut f = std::fs::File::create(path).unwrap();
    f.write_all(bytes).unwrap();
  }

  fn start_test_server(vault: &PathBuf) -> PdfServerHandle {
    start_pdf_server(vault.clone()).expect("start server")
  }

  fn http_get(port: u16, target: &str, headers: &str) -> (u16, Vec<u8>, String) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    let req = format!("GET {target} HTTP/1.1\r\nHost: 127.0.0.1\r\n{headers}Connection: close\r\n\r\n");
    stream.write_all(req.as_bytes()).unwrap();
    let mut all = Vec::new();
    stream.read_to_end(&mut all).unwrap();
    let text = String::from_utf8_lossy(&all).to_string();
    let (head, body) = match text.find("\r\n\r\n") {
      Some(i) => (text[..i].to_string(), all[i + 4..].to_vec()),
      None => (text, Vec::new()),
    };
    let code: u16 = head
      .split_whitespace()
      .nth(1)
      .and_then(|c| c.parse().ok())
      .unwrap_or(0);
    (code, body, head)
  }

  #[test]
  fn range_parse_cases() {
    assert_eq!(parse_single_range(None, 100), None);
    assert_eq!(parse_single_range(Some("bytes=0-9"), 100), Some((0, 9)));
    assert_eq!(parse_single_range(Some("bytes=10-"), 100), Some((10, 99)));
    assert_eq!(parse_single_range(Some("bytes=-20"), 100), Some((80, 99)));
    assert_eq!(
      parse_single_range(Some("bytes=0-9,20-29"), 100),
      None
    );
    assert_eq!(parse_single_range(Some("bytes=50-200"), 100), Some((50, 99)));
    assert_eq!(parse_single_range(Some("bytes=200-300"), 100), None);
    assert_eq!(parse_single_range(Some("bytes=-0"), 100), None);
    assert_eq!(parse_single_range(Some("x"), 100), None);
  }

  #[test]
  fn serves_full_pdf_with_headers() {
    let vault = temp_vault("full");
    let pdf = vault.join("notes").join("a.pdf");
    let bytes: Vec<u8> = b"%PDF-1.4 fake body 1234567890".to_vec();
    write_file(&pdf, &bytes);
    let h = start_test_server(&vault);
    let url_path = format!("/doc?path={}&t={}", "notes/a.pdf", h.token);
    let (code, body, head) = http_get(h.port, &url_path, "");
    assert_eq!(code, 200);
    assert_eq!(body, bytes);
    assert!(head.to_ascii_lowercase().contains("content-type: application/pdf"));
    assert!(head.to_ascii_lowercase().contains("accept-ranges: bytes"));
    drop(h);
    let _ = std::fs::remove_dir_all(&vault);
  }

  #[test]
  fn serves_range_206() {
    let vault = temp_vault("range");
    let pdf = vault.join("b.pdf");
    let bytes: Vec<u8> = (0u8..=200u8).collect();
    write_file(&pdf, &bytes);
    let h = start_test_server(&vault);
    let url_path = format!("/doc?path={}&t={}", "b.pdf", h.token);
    let (code, body, head) = http_get(h.port, &url_path, "Range: bytes=10-19\r\n");
    assert_eq!(code, 206);
    assert_eq!(body, &bytes[10..20]);
    assert!(head.to_ascii_lowercase().contains("content-range: bytes 10-19/201"));
    drop(h);
    let _ = std::fs::remove_dir_all(&vault);
  }

  #[test]
  fn rejects_bad_token_and_escapes() {
    let vault = temp_vault("guard");
    let pdf = vault.join("c.pdf");
    write_file(&pdf, b"%PDF-1.4 x");
    let h = start_test_server(&vault);
    let (code, _, _) = http_get(h.port, "/doc?path=c.pdf&t=wrong", "");
    assert_eq!(code, 403);
    let (code2, _, _) = http_get(
      h.port,
      &format!("/doc?path={}&t={}", "..%2F..%2Fsecret.pdf", h.token),
      "",
    );
    assert_eq!(code2, 404);
    drop(h);
    let _ = std::fs::remove_dir_all(&vault);
  }

  #[test]
  fn rejects_soit_and_non_pdf() {
    let vault = temp_vault("kind");
    let secret = vault.join(".soit").join("universe.db");
    write_file(&secret, b"db");
    let txt = vault.join("note.txt");
    write_file(&txt, b"hello");
    let h = start_test_server(&vault);
    let (code1, _, _) = http_get(
      h.port,
      &format!("/doc?path={}&t={}", ".soit%2Funiverse.db", h.token),
      "",
    );
    assert_eq!(code1, 404);
    let (code2, _, _) = http_get(
      h.port,
      &format!("/doc?path={}&t={}", "note.txt", h.token),
      "",
    );
    assert_eq!(code2, 404);
    drop(h);
    let _ = std::fs::remove_dir_all(&vault);
  }

  #[test]
  fn shutdown_closes_port() {
    let vault = temp_vault("stop");
    let h = start_test_server(&vault);
    let port = h.port;
    drop(h);
    std::thread::sleep(std::time::Duration::from_millis(150));
    let again = TcpStream::connect(("127.0.0.1", port));
    assert!(again.is_err(), "port should be closed after drop");
    let _ = std::fs::remove_dir_all(&vault);
  }

  #[test]
  fn pdf_url_encodes_path() {
    let vault = temp_vault("url");
    let h = start_test_server(&vault);
    let u = pdf_url(&h, "论文/逻辑学 笔记.pdf");
    assert!(u.contains("path=%E8%AE%BA%E6%96%87%2F%E9%80%BB%E8%BE%91%E5%AD%A6+%E7%AC%94%E8%AE%B0.pdf"), "got {u}");
    assert!(u.contains(&format!("t={}", h.token)));
    drop(h);
    let _ = std::fs::remove_dir_all(&vault);
  }
}
