# 文档陪读查看（PEL-156）— Spec v1.1

> 日期: 2026-08-20  
> 依据: Linear PEL-156；`知识库/docs/共识.md` §2.1；`对象模型.md` 文档引用；`doc-session-fsm.md`；`非目标.md`；`card-stage-chrome.md`；竞品调研（卡主台+陪读）；Oracle REVISE → v1.1  
> 基线分支: `main`  
> 前置依赖: 设置壳/空间绑库；Host universe open；Composer 附件（仅 prompt 注入）；卡 PiP FSM（勿复用为文档窗）  
> **SSoT:** 本文件。`知识库/specs/` 仅 stub 链接，禁止维护第二份全文。

---

## 摘要

Soit 今天只能把本地文件当 Composer 附件塞进 prompt，**不能**对着材料并排精读。本 Spec 落地 **卡主台 + 只读陪读面**：Host 安全读 vault 内文件 → FE `DocSession` 状态机 → 中栏分栏预览（**P0：md/text**；**pdf 探测 + 引导，内嵌 P1**）→ 划词接入既有解释/引用/深挖发散。不做成第二编辑器、不做成树上第三种节点、不扫 vault。

**v1.1 冻结：** PDF 不走 `data:` iframe（CSP 会挂）；深挖 `turnId` 选 A（须有卡内 turn）；回源可重开文档；SSoT 单份 SPE。

---

## 0. 前置依赖

| 已有 | 说明 |
|------|------|
| `open_universe` / `vaultPath` / 解绑 | 空间绑定；文档路径必须落在当前 vault |
| `SourceSpan` / `spawn_inquiry` | 深挖发散；需可选 doc 锚点字段 |
| `Composer` + `composerPayload` | 单条 quote 字符串；Doc 引用格式化后写入 |
| `SelectionBar` / `TermFloat` / `DirectionChooser` | 卡内划词出口；DocPane **自管**选区状态后复用条 UI |
| `AppShell` focus/map 互斥 | 进 map 卸卡挂 Orbit；文档须同卸 |
| `card-pip-fsm` | 仅探究卡；文档独立 FSM |
| `handoff.rs` path 前缀校验 | Host 读文件沙箱范本 |
| 共识 §2.1 / `doc-session-fsm.md` | **已拍板**产品边界（本 Spec 实现） |
| CSP `tauri.conf.json` | `default-src 'self'`；`data:` 仅 `img-src` — **禁止** PDF `data:` iframe 方案 |

---

## 1. 现状

### 1.1 无文档查看栈

| 缺口 | 证据 |
|------|------|
| 无 PDF/md 查看组件 | `package.json` 无 pdfjs；无 `DocPane` |
| 无 DocSession | `workspaceStore` 仅 `workspaceMode` focus/map |
| 无读文件 Host 命令 | `capabilities/default.json` 无 doc/fs 权限 |
| 附件不持久、不预览 | `composerPayload.ts`：文本 inline，二进制仅文件名 |
| CSP 紧 | 无 vault asset；无 `frame-src`/`worker-src` 放行 PDF 嵌入 |
| Empty 中栏 | `showEmpty` 只挂 `EmptyWorkspace`，无 Doc 挂点（须扩展矩阵） |
| 回源 | `returnToSource` 仅按 `data-turn` 滚卡内；无 docPath 分支 |

### 1.2 可复用

- `AppShell` `workspace-main` 中栏挂载点  
- `reduceCardPip` 的 phase 思路（**复制模式到 `docSession.ts`，不共享 reducer**）  
- Runtime `runs_dir` canonicalize + `starts_with` vault 前缀  
- 主题 tokens（`--bg-panel`、`--ink`）— Doc 面禁止硬编码奶油白  
- `SelectionBar` 纯展示（text/x/y + callbacks）  
- `renderAssistantHtml` 转义白名单思路（Doc md **不**跑 `wrapMarks`）

### 1.3 产品红线（已写知识库）

- 只读；编辑归 Obsidian  
- 非新卡片类型  
- 全局一次一个 DocSession  
- 进 map → closed  
- 不整份 PDF 进 prompt  

---

## 2. 需要做的工作

### 2.1 共识已落地（本波文档门闩）

实现前确认下列文件已含 PEL-156 边界（本编排已写，fixer 勿回退）：

- `知识库/docs/共识.md` §2.1 + Q16  
- `知识库/docs/对象模型.md` DocRef/DocSession/DocAnchor/SourceSpan 扩展  
- `知识库/docs/非目标.md` 文档相关条目  
- `知识库/docs/doc-session-fsm.md`  
- `知识库/docs/card-stage-chrome.md` PEL-156 段  

### 2.2 Host：安全读 vault 文档（P0）

**命令：**

| Command | 入参 | 出参 |
|---------|------|------|
| `resolve_vault_doc` | `{ path: string }` 用户输入（相对 vault 或绝对但必须在 vault 内） | `{ ok, pathRel, pathAbs, kind, displayName, size, error? }` |
| `read_vault_text` | `{ pathRel: string, maxBytes?: number }` | `{ ok, text?, error? }` — 超限 **error**，不截断当成功全文 |

**P0 不实现** `read_vault_file_base64` / bulk PDF 读。`resolve_vault_doc` 对 pdf 仍返回 `kind=pdf` + size；UI 走引导态。

**规则：**

1. 宇宙未打开 → error `universe_closed`  
2. `dunce::canonicalize` 后 path 必须 `starts_with(vault_canon)`；拒绝 `..` 逃逸；symlink 靠 canonicalize  
3. 默认拒绝读 `vault/.soit/**`  
4. kind 探测：扩展名为主；映射 `md|text|pdf|unsupported`（`.md`→md；常见文本扩展→text；`.pdf`→pdf）  
5. 限额（P0）：text/md **1_500_000** bytes；超限明确 error  
6. `pathRel` 输出统一 `/` 分隔、相对 vault 根  
7. 文本读：非法 UTF-8 → error（或有损替换须在 error 字段标明；**默认严格 UTF-8 error**）  
8. **不**在 bootstrap 注册额外 DB；命令仅当 universe open  
9. 权限：`allow-resolve-vault-doc` / `allow-read-vault-text` + `default.json`  
10. 单测：tempdir vault 内可读；vault 外 / `.soit` 内拒绝  

**浏览器 mock（`host.ts`）：** 无 Tauri 时 `resolve`/`read` 对 `demo/welcome.md`（及任意 `*.md` 在 mock 映射表）返回固定中文 fixture，保证 `npm run dev` 可分栏。

### 2.3 FE 类型与纯 FSM（P0）

**新建 `src/lib/docSession.ts` + `docSession.test.ts`：**

```ts
export type DocKind = "md" | "text" | "pdf" | "unsupported";
export type DocLayout = "split" | "doc-wide" | "peek";
export type DocStatus = "closed" | "loading" | "ready" | "error" | "closing";

export type DocRef = {
  pathRel: string;
  displayName: string;
  kind: DocKind;
  size?: number;
};

export type DocSessionState = {
  status: DocStatus;
  ref: DocRef | null;
  layout: DocLayout;
  boundCardId: string | null;
  cursor: { page?: number; scrollTop?: number };
  error: string | null;
  /** 递增，用于丢弃过期 load */
  epoch: number;
  /** ready 时的文本缓存（md/text）；pdf 引导态可无正文 */
  textContent: string | null;
  /** open 时用户输入的 path，供 retry */
  requestPath: string | null;
};

export type DocSessionEvent =
  | { type: "open"; path: string; boundCardId?: string | null }
  | { type: "load_ok"; epoch: number; ref: DocRef; textContent?: string | null }
  | { type: "load_err"; epoch: number; error: string }
  | { type: "set_layout"; layout: DocLayout }
  | { type: "rebind"; boundCardId: string | null }
  | { type: "set_cursor"; cursor: DocSessionState["cursor"] }
  | { type: "retry" } // error → loading；复用 requestPath
  | { type: "close" }
  | { type: "closed" }
  | { type: "force_close" }; // map / loadSnapshot — 可跳过 anim 直接 closed
```

- `reduceDocSession` 纯函数；单测覆盖 FSM 表。  
- `open` 在 `loading|ready|error` 时 **取消前 epoch**（epoch++）。  
- `force_close` → 直接 `closed`（清 ref/text/error）。  

**扩展 `src/types.ts` `SourceSpan`：**

```ts
docPath?: string;
docPage?: number;
docKind?: string;
```

Host `SourceSpanDto` 同步 optional 字段（D5）；serde 缺省兼容旧边。`turn_id` 保持 `String`。

**文档引用 → Composer（v1 单 quote）：**

```ts
export type DocAnchor = {
  path: string;
  text: string;
  page?: number;
};

/** 格式化为一条 quote 字符串，再走现有 quote → buildComposerUserBody */
export function formatDocAnchorQuote(a: DocAnchor): string {
  const loc = a.page != null ? `${a.path} p.${a.page}` : a.path;
  return `（${loc}）\n${a.text}`;
}
```

不在 v1 引入多 chip `docQuotes[]`。

### 2.4 workspaceStore 集成（P0）

持有：

- `docSession: DocSessionState`  
- actions：`openDoc(path)` / `closeDoc()` / `setDocLayout` / `rebindDoc` / `retryDoc`  

**无** `docPdfBase64`（P0）。

副作用：

1. `open` → reduce loading + epoch++  
2. `resolve_vault_doc` →  
   - `md|text` → `read_vault_text` → `load_ok`  
   - `pdf|unsupported` → `load_ok` 且 `textContent=null`（UI 引导）或 `load_err`（若 resolve 失败）  
3. epoch 校验后提交  
4. **force_close 表（必须全部接线）：**

| Trigger | Action |
|---------|--------|
| `setWorkspaceMode('map')` / `toggleMapMode` → map | `force_close` |
| **`loadSnapshot` 一律** | `force_close`（解绑 demo、换库、boot、host merge） |
| `openDoc` 时已有 inflight | 新 epoch 丢弃旧响应 |
| 专注模式 enter/exit | **不**关 Doc |

5. `force_close`：reduce + 丢弃 inflight（epoch++）  
6. **focus 切换：** 保持 path/session；若 `boundCardId === prevFocus` 或 `null`，可将 `boundCardId` 更新为新 focus（推荐）  

**不做** DocSession 进 universe.db v1。

### 2.5 UI：DocPane + 中栏分栏（P0）

| 文件 | 职责 |
|------|------|
| `src/components/doc/DocPane.tsx` | chrome：文件名、关、layout、错误/loading/retry；挂 Md 或 PDF 引导 |
| `src/components/doc/MdTextView.tsx` | 只读：text→`<pre>`；md→安全子集 HTML（**无** chat marks/`wrapMarks`）；`user-select: text` |
| `src/components/doc/PdfGuide.tsx` | kind=pdf：显示 pathRel、size、说明「P0 请用系统/Obsidian 打开；内嵌后置」；**无** iframe/base64 |
| `src/components/doc/OpenDocPopover.tsx` | 路径输入 + 最近 5 条 |
| `src/components/doc/doc.css` | tokens；禁止 `#fff`/cream 硬编码 |
| `AppShell.tsx` | 中栏矩阵（下表）+ Esc |

**中栏矩阵（P0）：**

| workspaceMode | showEmpty | doc status | 中栏 |
|---------------|-----------|------------|------|
| map | * | * | Orbit only；doc 已 `force_close` |
| focus | no | closed | InquiryCard 全宽 |
| focus | no | loading/ready/error | `.workspace-split`：Card \| DocPane |
| focus | yes | closed | EmptyWorkspace |
| focus | yes | loading/ready/error | DocPane 全宽（`boundCardId=null`）；无卡则深挖/发散 disable |

布局 CSS：

```text
.workspace-split { display:flex; height:100%; min-width:0; }
.workspace-split .center-stage { flex: 1 1 58%; min-width: 0; }
.workspace-split .doc-pane { flex: 1 1 42%; min-width: 280px; border-inline-start: … }
.workspace-split.is-doc-wide .center-stage { flex-basis: 32%; }
.workspace-split.is-doc-wide .doc-pane { flex-basis: 68%; }
```

peek：fixed 右半；**Esc** 关 peek→`close`（v1）。

**AppShell Esc 顺序：** `settings → palette → doc peek/close（若 peek 或优先关 doc）→ map→focus → …`

**打开入口（P0 必须 ≥1，推荐 2）：**

1. Composer 工具「打开文档」→ `OpenDocPopover`  
2. 命令面板「打开文档…」→ 同一 popover  

禁止：`window.prompt`；`<input type="file">` 作主路径；v1 native 选文件插件。  
未绑定 → 文案引导设置·空间。Mock：`demo/welcome.md`。

**PDF 内嵌（P1，本波不实现）：** pdfjs canvas + CSP `worker-src 'self'`；或 scoped asset 协议。**禁止** `data:`/`blob:` iframe 作为正式方案。

### 2.6 划词贯通（P0 同波 D5）

- Doc 正文可选中  
- **DocPane 自管** selection 状态 + 坐标；渲染共享 `SelectionBar`  
- 引用 → `formatDocAnchorQuote` → 现有 `setQuote` / composer quote 槽  
- 解释 → 现有短解释管线（不建卡）  
- 深挖/发散：  
  - 必须 `spawnInquiry({ kind, source, … })`（**禁止** `spawnDeepen`/`spawnDiverge` 便利封装截断 48 字）  
  - `source.text` = 全文选区；`docPath` / `docPage?` / `docKind?`；`turnId` = 焦点卡 **last/active turn id**  
  - **选 A：** 无 turns 时按钮 disable + toast「先在卡内有一轮对话」  
- **回源：** `returnToSource` 若 `span.docPath` → focus 父卡后 `openDoc(docPath)` 并恢复 `docPage` 线索；否则现有 turn 高亮。无 docPath 且空 turnId：仅回父卡。  
- Host DTO：仅追加 optional `docPath`/`docPage`/`docKind`。

### 2.7 AGENTS 与壳文档（P1）

- `src/components/shell/AGENTS.md`：中栏矩阵；map 卸 doc；Esc  
- `src/components/doc/AGENTS.md`：只读边界  
- `src/lib/AGENTS.md`：docSession / host  
- `src-tauri/AGENTS.md`：新 commands  
- `知识库/specs/2026-08-20-doc-companion-viewer-spec.md`：**stub 链到本文件**

### 2.8 主题

Doc pane：`var(--bg-panel)` / `var(--bg-card)`；正文 `var(--ink)`；代码 `var(--bg-muted)`。墨夜禁止大面积 `#fff`。

---

## 3. 文件变更清单

| 文件 | 变更 | 节 |
|------|------|-----|
| `知识库/docs/*` | 已拍板；本波只校验 | 2.1 |
| `src-tauri/src/doc/mod.rs`（或 `doc_read.rs`） | path 沙箱 + resolve + read_text | 2.2 |
| `src-tauri/src/lib.rs` | 注册 commands | 2.2 |
| `src-tauri/permissions/*` + `capabilities/default.json` | allow 两命令 | 2.2 |
| `src-tauri/src/universe/dto.rs` | SourceSpanDto optional doc*（D5） | 2.6 |
| `src/types.ts` | SourceSpan 扩展；Doc DTO | 2.3 |
| `src/lib/host.ts` | resolve/read + mock | 2.2 |
| `src/lib/docSession.ts` + test | 纯 FSM | 2.3 |
| `src/lib/composerPayload.ts` + test | `formatDocAnchorQuote` | 2.3 |
| `src/state/workspaceStore.ts` | docSession + force_close | 2.4 |
| `src/components/doc/*` | DocPane / Md / PdfGuide / OpenDoc / css / AGENTS | 2.5 |
| `src/components/shell/AppShell.tsx` | 矩阵 + Esc + split | 2.5 |
| `src/components/card/Composer.tsx` | 打开入口 | 2.5 |
| `src/components/card/InquiryCard.tsx` | 回源 docPath 分支 | 2.6 |
| `src/styles/app.css` | workspace-split | 2.5 |
| `src/components/shell/AGENTS.md` 等 | 文档 | 2.7 |
| `docs/superpowers/specs/本文件` | **SSoT** | — |
| `知识库/specs/…-doc-companion-viewer-spec.md` | **仅 stub** | D6 |

---

## 4. 架构图

```text
[Composer / Palette → OpenDocPopover]
        │ path
        ▼
  workspace.openDoc
        │ reduce → loading (epoch++)
        ▼
  host.resolve_vault_doc
        ├─ md|text → read_vault_text → load_ok(text)
        ├─ pdf → load_ok(text=null) → PdfGuide
        └─ fail → load_err
        ▼
  AppShell 中栏矩阵（focus/empty/map）
        │
DocPane select ──► SelectionBar（Doc 自管 state）
     ├─ quote → formatDocAnchorQuote → composer quote
     ├─ explain → 短解释
     └─ deepen/diverge → spawnInquiry(full text + doc*)
              └─ 回源 ← docPath ? openDoc : turn highlight
```

```text
DocSession FSM:
closed → loading → ready ⇄ layout
                 ↘ error ⇄ retry→loading | close
* → force_close → closed
open 取消前 epoch
```

---

## 5. 实施顺序

| 阶段 | 计划 | 依赖 | 工作量 |
|------|------|------|--------|
| W1 | **D1** Host doc read + permissions + Rust tests | — | M |
| W1 | **D2** docSession FSM + types + formatDocAnchorQuote + tests | — | S |
| W2 | **D3** workspaceStore + host.ts + force_close 全表 | D1, D2 | M |
| W2 | **D4** DocPane + MdTextView + PdfGuide + AppShell 矩阵 + 打开入口 + 主题 | D3 | M |
| W3 | **D5** Doc 选区 + SelectionBar + SourceSpan doc* Host/FE + spawnInquiry + **doc 回源** | D3, D4 | M |
| W3 | **D6** AGENTS + specs stub + npm test/build + cargo test | D5 | S |

```text
Wave 1 (parallel): D1 ‖ D2
Wave 2 (sequential): D3 → D4
Wave 3 (sequential): D5 → D6
```

冲突：D3 先 store；D4 只 UI/AppShell；D5 改 dto 在 D1 后；D2 纯模块。

**后置（非本波）：** D4b PdfView pdfjs + CSP。

---

## 6. 验收标准

- [ ] vault 内 `md`/`txt` 可打开，中栏分栏只读，主题 token（墨夜非大面积白底）  
- [ ] vault 内 pdf：P0 **明确引导**，不得 CSP 白屏/静默失败  
- [ ] vault 外、`.soit/` → 拒绝 + 文案  
- [ ] 未绑定 → 引导空间设置  
- [ ] 进 map / 解绑 / `loadSnapshot` → DocPane 消失、无残留会话  
- [ ] 回 focus 不自动重开  
- [ ] 引用进入发送正文含路径/摘录  
- [ ] 深挖/发散：边含 `docPath` + 全文 `text`；无 turn 时 disable  
- [ ] 子卡回源：有 `docPath` 时重开陪读（尽力页码）；卡内起源仍 turn 高亮  
- [ ] `npm run dev` mock 可开 `demo/welcome.md` 分栏  
- [ ] empty + doc：可全宽 DocPane  
- [ ] `npm test`（docSession 等）+ `npm run build`  
- [ ] `cargo test` path 沙箱  
- [ ] 冷启动无 vault walk  
- [ ] 无第二编辑器、无 CardPip 塞文档、无 `data:` PDF iframe  

---

## 7. 不在范围

- Soit 内编辑写回 md/PDF  
- 文档批注线程 / 高亮同步 Obsidian  
- 多 tab 文档、分屏多文档  
- vault 文件树、全文预览索引  
- 整 PDF 进模型上下文  
- Agent `read_file` 工具  
- native OS 文件选择器插件  
- 外链 URL 预览、图片/Office  
- DocSession 持久化进 universe.db  
- 与 card-read-explain 批注层合并  
- **`data:` / `blob:` PDF iframe 正式方案**  
- **空 `turnId` 表示文档锚点协议**  
- **`知识库/specs` 与 superpowers 维护两份全文**  
- Composer 多文档引用 chip（v1 单 quote 字符串）  
- P0 内嵌 PDF（pdfjs / asset 协议）— **P1**  

---

## 8. 版本变更

| 版本 | 说明 |
|------|------|
| v1.0 | 首版；知识库 §2.1 已先落地 |
| v1.1 | Oracle REVISE：PDF=引导非 iframe；turnId 选 A + doc 回源；SSoT；empty+doc 矩阵；force_close/Esc 表；单 quote；D4 md-first |
