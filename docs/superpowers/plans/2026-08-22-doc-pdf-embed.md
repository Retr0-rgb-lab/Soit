# Doc PDF Embed (PEL-156 P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 右侧「资料与预览」栏内嵌 PDF 预览：Rust 侧懒启动 127.0.0.1 回环微型 HTTP 服务（每 vault 随机 token + 每请求沙箱校验），前端 `PdfView` 组件用 iframe 承载 WebView2 原生 PDF 查看器；失败回退 `PdfGuide`。

**Architecture:** `doc/pdf_server.rs` 手写 HTTP/1.1（std::net，零新 Cargo 依赖）流式服务 vault 内 PDF（支持单段 Range）；`AppState.pdf_server: Mutex<Option<PdfServerHandle>>`，`open_universe_impl` 成功后（重）启动、`close_universe` 关闭；新命令 `get_pdf_preview_url` 返回带 token 的 URL；前端 `PdfView` iframe 渲染，`PdfGuide` 兜底。

**Tech Stack:** Rust std::net（无新依赖；`url` crate 已存在用于 query 解析/编码）+ Tauri 2 + React 18 + Vitest。

## Global Constraints

- 规格：`docs/superpowers/specs/2026-08-22-doc-pdf-embed-design.md` v1.0（本计划逐字实现）
- **零新 Cargo 依赖**（`src-tauri/Cargo.toml` 不动）；前端零新 npm 依赖
- 不碰 `data:`/`blob:` PDF；服务只绑 `127.0.0.1`，端口 0 随机
- 沙箱复用 `doc::resolve_under_vault`（canonicalize + starts_with + 拒 `.soit/`）；不新增 fs scope
- 新命令三件套：handler + `permissions/bootstrap.toml` + `capabilities/default.json`
- JSON 字段 camelCase（serde `rename_all = "camelCase"`）
- 冷启动/bootstrap 不启动服务、不出网、不开端口
- Rust 测试在 `src-tauri/` 跑 `cargo test`；单测不访问外网（回环 TCP 允许）
- 中文 UI 文案与现有一致；主题 token，无 `#fff` 硬编码
- 每个任务完成即 `git commit`（用户已批准本计划的逐任务提交）

---

### Task 1: Rust pdf_server 模块（TDD）

**Files:**
- Create: `src-tauri/src/doc/pdf_server.rs`（服务 + 纯函数 + 全部测试）
- Modify: `src-tauri/src/doc/mod.rs`（`pub mod pdf_server;` 一行，模块声明处 `pub mod materials;` 之后）

**Interfaces:**
- Produces:
  - `pub struct PdfServerHandle { pub port: u16, pub token: String, pub vault_canon: PathBuf, listener: TcpListener, shutdown: Arc<AtomicBool> }`（listener/shutdown 私有）
  - `pub fn start_pdf_server(vault_canon: PathBuf) -> Result<PdfServerHandle, String>`
  - `pub fn pdf_url(handle: &PdfServerHandle, path_rel: &str) -> String`
  - `pub fn parse_single_range(header: Option<&str>, file_len: u64) -> Option<(u64, u64)>`（inclusive，无/多段/非法 → None → 服务回 200 全量）
  - Task 2/4 消费。

- [ ] **Step 1: 写失败测试**

`src-tauri/src/doc/pdf_server.rs` 直接先写整个文件骨架但**不实现**（`parse_single_range` 返回 `None`、`start_pdf_server` 返回 `Err("todo")`），`#[cfg(test)] mod tests` 完整（见 Step 3 的测试代码）。此步只求编译通过 + 测试全红。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd src-tauri && cargo test doc::pdf_server`
Expected: FAIL（多个测试红，`start_pdf_server` 返回 Err）。

- [ ] **Step 3: 完整实现 + 测试**

将 `src-tauri/src/doc/pdf_server.rs` 实现为以下完整内容（含测试；逐段替换骨架）：

```rust
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
    listener, // handle owns the ORIGINAL listener; thread holds the clone
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
  use std::io::Read as _;
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
```

`src-tauri/src/doc/mod.rs` 顶部模块声明区（`pub mod materials;` 之后）加：

```rust
pub mod pdf_server;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && cargo test doc::pdf_server`
Expected: PASS（7 个测试）。再 `cargo test` 全量确认无回归。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/doc/pdf_server.rs src-tauri/src/doc/mod.rs
git commit -m "feat(doc): vault pdf preview loopback server (PEL-156 P1)"
```

---

### Task 2: Rust 接线（AppState 生命周期 + 命令 + 权限 + CSP）

**Files:**
- Modify: `src-tauri/src/lib.rs`（AppState 字段；open/close 生命周期；handler 注册）
- Modify: `src-tauri/src/doc/mod.rs`（`get_pdf_preview_url` command + DTO）
- Modify: `src-tauri/permissions/bootstrap.toml`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/tauri.conf.json`（CSP）

**Interfaces:**
- Consumes: Task 1 的 `start_pdf_server` / `pdf_url` / `PdfServerHandle`。
- Produces: Tauri command `get_pdf_preview_url(pathRel: String) -> { ok, url?, error? }`。Task 4 经 `host.ts` 消费。

- [ ] **Step 1: 实现 lib.rs 接线**

`src-tauri/src/lib.rs`：

a) `AppState` 结构体 `runtime_handoff` 字段后加：

```rust
  /// Lazy PDF preview server (PEL-156 P1) — one per open vault; None = off.
  pub(crate) pdf_server: Mutex<Option<doc::pdf_server::PdfServerHandle>>,
```

`Default` impl 加 `pdf_server: Mutex::new(None),`。

b) `open_universe_impl`：在 `let bound_path = u.vault_path.to_string_lossy().to_string();` 之后加 `let vault_canon = u.vault_path.clone();`；在 `*g = Some(u);` 之后（`if let Some(app) = app { ... }` 之前）加：

```rust
          // P1 PDF embed — (re)start loopback preview server for this vault.
          match state.pdf_server.lock() {
            Ok(mut ps) => {
              *ps = match doc::pdf_server::start_pdf_server(vault_canon.clone()) {
                Ok(h) => Some(h),
                Err(e) => {
                  log::warn!("pdf preview server start failed: {e}");
                  None
                }
              };
            }
            Err(_) => log::warn!("pdf server lock poisoned"),
          }
```

c) `close_universe` 函数体，`*g = None;` 之后加：

```rust
  if let Ok(mut ps) = state.pdf_server.lock() {
    *ps = None; // Drop 置 shutdown 标志 → 线程退出 → 端口释放
  }
```

d) `generate_handler![...]` 在 `doc::read_vault_text,` 之后加 `doc::get_pdf_preview_url,`。

- [ ] **Step 2: 实现 command + DTO**

`src-tauri/src/doc/mod.rs`：`read_vault_text` command 之后加：

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetPdfPreviewUrlResult {
  pub ok: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub url: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

impl GetPdfPreviewUrlResult {
  fn err(msg: impl Into<String>) -> Self {
    Self {
      ok: false,
      url: None,
      error: Some(msg.into()),
    }
  }
}

/// Lazy PDF preview URL (PEL-156 P1). Loopback server + per-vault token; sandbox first.
#[tauri::command]
pub fn get_pdf_preview_url(
  path_rel: String,
  state: State<'_, AppState>,
) -> GetPdfPreviewUrlResult {
  let (vault_canon, abs) = {
    let g = match state.universe.lock() {
      Ok(g) => g,
      Err(_) => return GetPdfPreviewUrlResult::err("universe lock poisoned"),
    };
    let u = match g.as_ref() {
      Some(u) => u,
      None => return GetPdfPreviewUrlResult::err("universe_closed"),
    };
    let vault_canon = u.vault_path.clone();
    match resolve_under_vault(&vault_canon, &path_rel) {
      Ok((abs, _)) => (vault_canon, abs),
      Err(e) => return GetPdfPreviewUrlResult::err(e),
    }
  };
  if probe_kind(&abs) != DocKind::Pdf {
    return GetPdfPreviewUrlResult::err("not a pdf");
  }
  {
    let mut ps = match state.pdf_server.lock() {
      Ok(g) => g,
      Err(_) => return GetPdfPreviewUrlResult::err("pdf server lock poisoned"),
    };
    if ps.is_none() {
      *ps = match pdf_server::start_pdf_server(vault_canon) {
        Ok(h) => Some(h),
        Err(e) => return GetPdfPreviewUrlResult::err(format!("pdf server start failed: {e}")),
      };
    }
  }
  let g = match state.pdf_server.lock() {
    Ok(g) => g,
    Err(_) => return GetPdfPreviewUrlResult::err("pdf server lock poisoned"),
  };
  let handle = match g.as_ref() {
    Some(h) => h,
    None => return GetPdfPreviewUrlResult::err("pdf server unavailable"),
  };
  GetPdfPreviewUrlResult {
    ok: true,
    url: Some(pdf_server::pdf_url(handle, &path_rel)),
    error: None,
  }
}
```

- [ ] **Step 3: 权限 + capabilities + CSP**

`src-tauri/permissions/bootstrap.toml` 末尾加：

```toml
[[permission]]
identifier = "allow-get-pdf-preview-url"
description = "Allow get_pdf_preview_url command (vault PDF loopback preview; PEL-156 P1)"
commands.allow = ["get_pdf_preview_url"]
```

`src-tauri/capabilities/default.json` permissions 数组 `"allow-read-vault-text",` 之后加 `"allow-get-pdf-preview-url",`。

`src-tauri/tauri.conf.json`：`security.csp` 字符串追加 `frame-src 'self' http://127.0.0.1:*`（即新 csp 为：`default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; frame-src 'self' http://127.0.0.1:*`）。

- [ ] **Step 4: 编译 + 测试**

Run: `cd src-tauri && cargo test`
Expected: 全绿（Task 1 的 7 个 + 既有全部）。`cargo check` 无警告新增。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/lib.rs src-tauri/src/doc/mod.rs src-tauri/permissions/bootstrap.toml src-tauri/capabilities/default.json src-tauri/tauri.conf.json
git commit -m "feat(doc): wire pdf preview server lifecycle + get_pdf_preview_url command"
```

---

### Task 3: host.ts 桥接 + 浏览器 mock

**Files:**
- Modify: `src/lib/host.ts`（新接口 + 函数，放在 `readVaultText` 之后）

**Interfaces:**
- Produces: `export interface GetPdfPreviewUrlResult { ok: boolean; url?: string; error?: string }`；`export async function getPdfPreviewUrl(pathRel: string): Promise<GetPdfPreviewUrlResult>`。Task 4 消费。

- [ ] **Step 1: 实现**

`src/lib/host.ts` `readVaultText` 函数之后加：

```ts
export interface GetPdfPreviewUrlResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/**
 * Lazy vault PDF preview URL (PEL-156 P1). Desktop: 127.0.0.1 loopback server.
 * Browser mock: no server — error so UI falls back to PdfGuide.
 */
export async function getPdfPreviewUrl(
  pathRel: string,
): Promise<GetPdfPreviewUrlResult> {
  if (!hasTauri()) {
    return { ok: false, error: "桌面版支持内嵌 PDF 预览" };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<GetPdfPreviewUrlResult>("get_pdf_preview_url", { pathRel });
}
```

（`hasTauri` 与 dynamic import 模式同文件既有；result 类型定义在函数上方，随文件导出。）

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 退出码 0。

- [ ] **Step 3: 提交**

```bash
git add src/lib/host.ts
git commit -m "feat(host): getPdfPreviewUrl bridge + browser mock"
```

---

### Task 4: PdfView 组件 + DocPane 接线 + 兜底文案 + CSS（TDD）

**Files:**
- Create: `src/components/doc/PdfView.tsx`
- Create: `src/components/doc/PdfView.test.tsx`
- Modify: `src/components/doc/DocPane.tsx`（import + pdf 分支）
- Modify: `src/components/doc/PdfGuide.tsx`（文案）
- Modify: `src/components/doc/doc.css`

**Interfaces:**
- Consumes: Task 3 的 `getPdfPreviewUrl`；`DocRef`（`../../lib/docSession`）。
- Produces: `PdfView({ docRef }: { docRef: DocRef })` — 内部三态 loading/ready/error；DocPane 使用。

- [ ] **Step 1: 写失败测试**

新建 `src/components/doc/PdfView.test.tsx`：

```tsx
/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PdfView from "./PdfView";

const hostMocks = vi.hoisted(() => ({
  getPdfPreviewUrl: vi.fn(),
}));

vi.mock("../../lib/host", () => ({
  getPdfPreviewUrl: (...args: unknown[]) => hostMocks.getPdfPreviewUrl(...args),
}));

afterEach(cleanup);

const docRef = {
  pathRel: "notes/paper.pdf",
  displayName: "paper.pdf",
  kind: "pdf" as const,
  size: 1234,
};

beforeEach(() => {
  hostMocks.getPdfPreviewUrl.mockResolvedValue({
    ok: true,
    url: "http://127.0.0.1:45678/doc?path=notes%2Fpaper.pdf&t=abc",
  });
});

describe("PdfView", () => {
  it("renders iframe when preview url resolves", async () => {
    render(<PdfView docRef={docRef} />);
    const frame = await screen.findByTitle("paper.pdf");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame.getAttribute("src")).toContain("127.0.0.1:45678");
    expect(hostMocks.getPdfPreviewUrl).toHaveBeenCalledWith("notes/paper.pdf");
  });

  it("falls back to PdfGuide when host errors", async () => {
    hostMocks.getPdfPreviewUrl.mockResolvedValueOnce({
      ok: false,
      error: "桌面版支持内嵌 PDF 预览",
    });
    render(<PdfView docRef={docRef} />);
    expect(
      await screen.findByRole("heading", { name: "PDF 内嵌预览不可用" }),
    ).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/components/doc/PdfView.test.tsx`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 PdfView + 接线**

新建 `src/components/doc/PdfView.tsx`：

```tsx
import { useEffect, useState } from "react";
import type { DocRef } from "../../lib/docSession";
import { getPdfPreviewUrl } from "../../lib/host";
import PdfGuide from "./PdfGuide";

type Props = {
  docRef: DocRef;
};

type Phase = "loading" | "ready" | "error";

/**
 * PDF embed (PEL-156 P1): iframe into the loopback preview server,
 * rendered by the WebView2 built-in PDF viewer. Falls back to PdfGuide
 * when the host cannot serve (browser mock / server start failure).
 */
export default function PdfView({ docRef }: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setPhase("loading");
    setUrl(null);
    void getPdfPreviewUrl(docRef.pathRel)
      .then((r) => {
        if (!alive) return;
        if (r.ok && r.url) {
          setUrl(r.url);
          setPhase("ready");
        } else {
          setPhase("error");
        }
      })
      .catch(() => {
        if (alive) setPhase("error");
      });
    return () => {
      alive = false;
    };
  }, [docRef.pathRel]);

  if (phase === "loading") {
    return (
      <div className="doc-pane__status" role="status">
        <p className="doc-pane__status-text">正在准备 PDF 预览…</p>
      </div>
    );
  }
  if (phase === "error" || !url) {
    return <PdfGuide docRef={docRef} />;
  }
  return (
    <iframe
      className="pdf-embed"
      src={url}
      title={docRef.displayName}
      referrerPolicy="no-referrer"
    />
  );
}
```

`src/components/doc/DocPane.tsx`：
- import 区 `import PdfGuide from "./PdfGuide";` 改为 `import PdfView from "./PdfView";`；
- 渲染区 `<PdfGuide docRef={ref} />` 改为 `<PdfView docRef={ref} />`。

`src/components/doc/PdfGuide.tsx` 文案：
- 标题行改为 `{isPdf ? "PDF 内嵌预览不可用" : "暂不支持预览此类型"}`；
- note 改为 `{isPdf ? "内嵌预览不可用（浏览器预览或服务启动失败）。桌面版通常可直接内嵌；也可用系统阅读器或 Obsidian 打开该文件。不会把整份 PDF 塞进对话。" : "当前仅支持 Markdown / 纯文本陪读。可用系统应用打开原文件。"}`。

`src/components/doc/doc.css`：`.pdf-guide` 块之后加：

```css
/* PDF embed (PEL-156 P1) — WebView2 built-in viewer inside the pane */
.pdf-embed {
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--bg-panel);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/components/doc/PdfView.test.tsx`
Expected: PASS（2 条）。再 `npx vitest run src/components/doc`（既有 MdTextView 等不回归）+ `npx tsc --noEmit`。

- [ ] **Step 5: 提交**

```bash
git add src/components/doc/PdfView.tsx src/components/doc/PdfView.test.tsx src/components/doc/DocPane.tsx src/components/doc/PdfGuide.tsx src/components/doc/doc.css
git commit -m "feat(doc): PdfView iframe embed with PdfGuide fallback"
```

---

### Task 5: AGENTS.md 同步

**Files:**
- Modify: `src/components/doc/AGENTS.md`
- Modify: `src-tauri/AGENTS.md`

- [ ] **Step 1: 更新 doc/AGENTS.md**

- Pieces 表 `PdfGuide.tsx` 行改为：

```md
| `PdfView.tsx` | pdf embed: iframe → loopback server (PEL-156 P1); loading/error; falls back to `PdfGuide` |
| `PdfGuide.tsx` | pdf/unsupported fallback guide — path, size, copy; shown on browser mock / server failure; **no** iframe/base64 here |
```

- Rules 中 `- P0 pdf = guide only. Embedded pdfjs is out of scope here.` 改为：

```md
- **PDF embed (P1):** `PdfView` iframe → `getPdfPreviewUrl` loopback server (127.0.0.1 + per-vault token + sandbox). Native viewer provides read/zoom/search/select-copy. **No PDF selection piping** (quote/explain/deepen stay md/text-only). pdfjs out of scope. `PdfGuide` remains the fallback.
```

- Do not 列表 `- \`data:\` / \`blob:\` PDF iframe.` 保留不动。

- [ ] **Step 2: 更新 src-tauri/AGENTS.md**

- Layout 表 `src/doc/` 行追加 `pdf_server.rs`：

```md
| `src/doc/` | Vault doc resolve + UTF-8 text read (PEL-156 path sandbox; no PDF bytes) + `pdf_server.rs` (loopback PDF preview, P1) + `materials/` list/import |
```

- Commands 表 `read_vault_text` 行后加：

```md
| `get_pdf_preview_url` | PEL-156 P1: `{ pathRel }` → `{ ok, url? }` loopback PDF preview URL; lazy server start; requires open universe; sandbox + kind=pdf + per-vault token |
```

- Rules 追加一条：

```md
- **PDF preview server:** bind 127.0.0.1 only, random port, per-vault token; start on `open_universe` success, shutdown on `close_universe`; never at bootstrap; no `data:`/`blob:` PDF; zero new Cargo deps.
```

- [ ] **Step 3: 提交**

```bash
git add src/components/doc/AGENTS.md src-tauri/AGENTS.md
git commit -m "docs: AGENTS sync for pdf embed (PEL-156 P1)"
```

---

### Task 6: 全量验证 + 桌面实测

**Files:** 无新增（验证任务）

- [ ] **Step 1: 前端全量**

Run: `npm test`
Expected: 全部 PASS（新增 PdfView 2 条）。

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: tsc 无错；vite build 成功。

- [ ] **Step 3: Rust 全量**

Run: `cd src-tauri && cargo test`
Expected: 全部 PASS（新增 pdf_server 7 条）。

- [ ] **Step 4: 桌面实测（重启 tauri dev 以载入新 Rust）**

1. 若 dev 未跑：`npm run tauri dev`（CDP 端口环境变量可选）；
2. 准备测试 PDF：在 vault 内放一个真实 PDF（`E:\学习软件\Fast-Learning\Logic\materials\sample.pdf`；若没有，先跑 `python -c "print('%PDF-1.4')"` 不行——用浏览器 mock 不行。改用：在 Logic vault 的 `materials/` 下找一个已有 PDF，或从系统复制任一小 PDF 进去。没有则跳过实机 PDF 检查，改由 Rust 集成测试兜底）；
3. 打开文档（Composer「打开文档」或命令面板）→ 输入该 PDF 路径 → 右栏出现原生查看器：可翻页/缩放/搜索/选中复制；
4. 错误路径：路径写 vault 外文件 → 服务拒绝且 UI 显示 PdfGuide 文案；
5. 浏览器 `npm run dev`：打开 `demo/welcome.md` 之外的 pdf 路径 → 显示引导（mock 行为不变）；
6. 退出工作区（close_universe）后 `netstat -ano | grep LISTENING` 中随机端口消失（服务已关）。

- [ ] **Step 5: 提交（若有 lint/微调）**

```bash
git status --short
git add -u && git commit -m "chore: verification tweaks for pdf embed"
```

---

## Self-Review 记录

- **Spec 覆盖：** §2.1→T1；§2.2→T2（AppState/命令/权限/CSP）；§2.3→T3/T4；§2.4 边界→T1 测试 + T6；§2.5 测试→T1/T4/T6；§3 文件清单→全部覆盖；§5 验收→T6。无缺口。
- **占位符扫描：** 无 TBD/TODO；每步含完整代码。
- **类型一致性：** `PdfServerHandle{port,token,vault_canon}` 在 T1 定义、T2 消费；`parse_single_range(Option<&str>, u64) -> Option<(u64,u64)>` 定义与调用一致；`get_pdf_preview_url` 命令名在 mod.rs / bootstrap.toml / capabilities / host.ts 四处一致（snake_case invoke 名 ↔ camelCase 参数 `pathRel`）。
- **规格偏差说明：** 设计文档 §2.5 未列 HEAD/405/416 细节，T1 测试补充覆盖（超集，无冲突）。
