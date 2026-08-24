# 右侧栏 PDF 内嵌预览（PEL-156 P1）— Design v1.0

> 日期: 2026-08-22
> 依据: `2026-08-20-doc-companion-viewer-spec.md` v1.1（§2.5 PDF 内嵌 P1；§7 禁止 `data:`/`blob:` iframe 作为正式方案）
> 基线分支: `main`
> Oracle: v1.0
> 决策（头脑风暴已确认）：**方案 A 原生查看器**（本地回环 HTTP 服务 + WebView2 内置 PDF 查看器）；**接受 PDF 无划词贯通**（引用/解释/深挖仅限 md/txt）

---

## 摘要

右侧「资料与预览」栏的 PDF 从「引导态」（PdfGuide）升级为**内嵌预览**：Rust 侧懒启动一个仅监听 `127.0.0.1` 随机端口的微型 HTTP 服务，把 vault 内 PDF 以 `application/pdf` 流式喂给 WebView2（Edge 内核）自带 PDF 查看器（iframe 承载）。阅读、翻页、缩放、搜索、选中复制由原生查看器免费提供；**不**支持 PDF 划词贯通。零新依赖；不碰 `data:`/`blob:`；每次请求做 vault 沙箱 + token 校验。

---

## 1. 现状与缺口

| 现状 | 证据 |
|------|------|
| PDF resolve 返回 kind+size，正文不读 | `src-tauri/src/doc/mod.rs` `resolve_vault_doc_impl` |
| UI 只有引导态 | `PdfGuide.tsx`；`DocPane.tsx:399-409` pdf 分支 |
| CSP 无 `frame-src` | `tauri.conf.json` security.csp |
| 无本地 HTTP 服务 | Cargo 无 server 依赖（reqwest 仅出站） |
| 沙箱 helper 可复用 | `resolve_under_vault`（canonicalize + starts_with + 拒 `.soit/`） |

---

## 2. 需要做的工作

### 2.1 Rust：微型 PDF 服务（P0）

**新建 `src-tauri/src/doc/pdf_server.rs`（无新 Cargo 依赖，std::net 手写 HTTP/1.1）：**

- `pub struct PdfServerHandle { port: u16, token: String, vault_canon: PathBuf, listener: TcpListener, shutdown: Arc<AtomicBool> }`
- `pub fn start_pdf_server(vault_canon: PathBuf) -> Result<PdfServerHandle, String>`：
  - `TcpListener::bind("127.0.0.1:0")`（OS 随机端口）；
  - 每连接一个线程（短任务）；accept 循环检查 `shutdown`，listener 被 drop 时线程退出；
  - token = 128-bit 随机 hex（`getrandom`？无此依赖 → 用 `SystemTime` + 进程内计数器 + 随机源简化：直接用 `std::collections::hash_map::RandomState` 生成两个 u64 拼 hex，足够本地防御）。
- 请求处理（每连接）：
  1. 读请求头（上限 8KiB，直到 `\r\n\r\n`）；
  2. 仅接受 `GET` / `HEAD`，路径必须形如 `/doc?path=<percent-encoded>&t=<token>`（用已有 `url` crate 的 `form_urlencoded` 解析）；
  3. token 不匹配 → `403`；参数缺失 → `400`；
  4. `resolve_under_vault(&vault_canon, path)` 沙箱校验（复用，自动拒 vault 外 / `.soit/`）→ 失败 `404`；
  5. `probe_kind` 必须为 `Pdf`，否则 `404`；
  6. 单段 `Range: bytes=a-b` 解析（纯函数 `parse_single_range(header, file_len) -> Option<(u64,u64)>`）：合法 → `206` + `Content-Range`；非法/多段 → 忽略按 `200` 全量；`bytes=-n` 后缀段支持；
  7. 响应头：`Content-Type: application/pdf`、`Accept-Ranges: bytes`、`Cache-Control: no-store`、`X-Content-Type-Options: nosniff`、`Content-Length`；
  8. 流式写文件字节（`File::seek` + 分块 copy 到 TcpStream）。
- `pub fn shutdown(handle: &PdfServerHandle)`：置位 shutdown + drop listener（drop 在 AppState 替换时自然发生）。

**生命周期（`src-tauri/src/lib.rs`）：**

- `AppState` 增 `pub(crate) pdf_server: Mutex<Option<PdfServerHandle>>`；
- `open_universe_impl` 成功后：停旧服务（若有）→ `start_pdf_server(vault_canon)` → 存入 state（失败仅记 `log::warn`，不阻断 open）；
- `close_universe`：shutdown + 置 None；
- 冷启动/bootstrap：**不**启动服务。

### 2.2 Host 命令（P0，三件套）

`get_pdf_preview_url(path_rel: String) -> GetPdfPreviewUrlResult`：

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetPdfPreviewUrlResult { ok: bool, url: Option<String>, error: Option<String> }
```

- universe 未打开 → `{ok:false, error:"universe_closed"}`；
- `resolve_under_vault` + `probe_kind == Pdf` 校验失败 → error 透传；
- 服务不存在（启动失败过）→ 尝试再次 `start_pdf_server`；
- 成功 → `http://127.0.0.1:{port}/doc?path={encode}&t={token}`。

注册：`lib.rs` `generate_handler!` + `permissions/bootstrap.toml` `allow-get-pdf-preview-url` + `capabilities/default.json`。

### 2.3 前端（P0）

- `src/lib/host.ts`：`getPdfPreviewUrl(pathRel)` 桥接；浏览器 mock 返回 `{ok:false, error:"桌面版支持内嵌 PDF 预览"}`；
- 新建 `src/components/doc/PdfView.tsx`：
  - mount 时 `getPdfPreviewUrl(ref.pathRel)` → 成功渲染 `<iframe className="pdf-embed" src={url} title={displayName} referrerPolicy="no-referrer" />`；
  - 失败 / mock → 渲染现有 `PdfGuide`（兜底）；
  - loading 期间 `doc-pane__status` 风格的「正在准备预览…」；
- `DocPane.tsx:399-409`：pdf 分支改渲染 `<PdfView docRef={ref} />`（md/text 不变）；
- `PdfGuide.tsx` 文案更新：「内嵌预览不可用（浏览器预览或服务启动失败）…桌面版通常可直接内嵌」；
- `doc.css`：`.pdf-embed { width:100%; height:100%; border:0; background:var(--bg-panel); }`；
- CSP（`tauri.conf.json`）：`frame-src 'self' http://127.0.0.1:*` 追加到现有 csp 串。

### 2.4 边界与错误处理

- 服务启动失败 → `get_pdf_preview_url` error → PdfView 落 PdfGuide（可读文案，不白屏）；
- 切库 / `close_universe` → 服务关闭，旧 iframe URL 失效（FE 每次打开文档都重新取 URL，天然无陈旧 URL）；
- 进 map / `loadSnapshot` → 既有 `force_close` 逻辑不变；
- 不设 PDF 大小硬上限（Range 流式交给原生查看器）；
- 浏览器 `npm run dev`：mock error → PdfGuide（与现状一致）。

### 2.5 测试

| 层 | 用例 |
|----|------|
| Rust 纯函数 | `parse_single_range`：合法段 / `bytes=-n` / 越界 / 非法→None |
| Rust 服务集成（真实 TcpStream 到 127.0.0.1 临时端口，temp vault） | 200 全量 + 字节一致 + Content-Type；Range→206 正确切片；错 token→403；vault 外 / `.soit/` / 非 pdf→404；HEAD 200；shutdown 后 accept 退出 |
| FE jsdom | `PdfView` 成功→iframe（mock getPdfPreviewUrl resolve）；失败→PdfGuide（mock reject） |
| 手工验收 | 桌面版开真实 PDF：翻页/缩放/搜索/选中复制；切库后旧 URL 失效；浏览器 mock 显示引导 |

---

## 3. 文件变更清单

| 文件 | 变更 |
|------|------|
| `src-tauri/src/doc/pdf_server.rs` | 新建：服务 + range 解析 + 单测 |
| `src-tauri/src/doc/mod.rs` | `pub mod pdf_server;` + `get_pdf_preview_url` command + DTO |
| `src-tauri/src/lib.rs` | AppState 字段 + open/close 生命周期 + handler 注册 |
| `src-tauri/permissions/bootstrap.toml` | `allow-get-pdf-preview-url` |
| `src-tauri/capabilities/default.json` | 同上 |
| `src-tauri/tauri.conf.json` | CSP 加 `frame-src 'self' http://127.0.0.1:*` |
| `src/lib/host.ts` | 桥接 + 浏览器 mock |
| `src/components/doc/PdfView.tsx` | 新建 |
| `src/components/doc/DocPane.tsx` | pdf 分支换 PdfView |
| `src/components/doc/PdfGuide.tsx` | 文案更新 |
| `src/components/doc/doc.css` | `.pdf-embed` |
| `src/components/doc/AGENTS.md` | PdfView 行 + P1 规则更新 |
| `src-tauri/AGENTS.md` | 新命令 + pdf_server |

热文件：`doc/mod.rs` / `lib.rs` / `host.ts` / `DocPane.tsx` — 串行改。

---

## 4. 数据流

```text
open_universe ──► start_pdf_server(vault_canon) ──► AppState.pdf_server
                                                        │
openDoc(pdf) → DocPane → PdfView ──► host.getPdfPreviewUrl(pathRel)
     │                                    │ (sandbox + kind 校验)
     ▼                                    ▼
  url = http://127.0.0.1:PORT/doc?path=…&t=token
     │
     ▼
<iframe src=url> ──► WebView2 原生 PDF 查看器（Range 流式）
                        ├─ 200 全量 / 206 分段
                        ├─ 错 token → 403（查看器显示错误页）
                        └─ 沙箱拒绝 → 404
```

---

## 5. 验收标准

- [ ] 桌面版打开 vault 内 PDF → 右栏内嵌原生查看器，可翻页/缩放/搜索/选中复制
- [ ] 错 token / vault 外 / `.soit/` / 非 pdf → 服务拒绝且 UI 不白屏（PdfGuide 兜底）
- [ ] 服务懒启动；冷启动无监听端口、无网络
- [ ] `close_universe` 后端口关闭、旧 URL 失效
- [ ] 浏览器 `npm run dev`：PDF 显示引导文案（不变更现有 mock 行为）
- [ ] CSP 更新后 `npm run build` / 桌面打包正常；无 `data:`/`blob:` PDF
- [ ] `npm test` / `npm run build` / `cargo test` 全绿
- [ ] 进 map / `loadSnapshot` → DocPane 关闭逻辑不回归

---

## 6. 不在范围

- PDF 划词贯通（引用/解释/深挖）——方案 A 已确认放弃
- pdfjs / Rust 转图渲染
- 整 PDF 进 prompt / Agent read_file 工具
- 多 PDF 同时打开、PDF 批注
- 原生文件选择器、外链 URL 预览
- 服务对外网暴露（仅 127.0.0.1）

---

## 7. 风险

| 风险 | 缓解 |
|------|------|
| 手写 HTTP 解析健壮性 | 单测覆盖 GET/HEAD/Range/错参；请求头 8KiB 上限；仅解析第一行 + Range/Connection 头 |
| WebView2 查看器对 127.0.0.1 小端口服务的行为差异 | 手工验收步骤；失败自动落 PdfGuide 兜底 |
| 本地回环被同机其他进程扫描 | 随机端口 + 每库随机 token + 仅 127.0.0.1 + 每请求沙箱校验 |
| CSP 改动影响现有页面 | 只增 frame-src 一项；build + 打包验证 |

---

## 8. 版本变更

| Ver | 说明 |
|-----|------|
| v1.0 | 初稿（方案 A；无划词贯通；手写微型服务） |
