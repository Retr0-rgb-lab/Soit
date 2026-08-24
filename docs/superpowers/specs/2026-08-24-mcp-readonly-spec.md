# 反向只读 MCP 接口 — Spec v1.0

> 日期: 2026-08-24
> 依据: `知识库/docs/共识.md` §6.2 / `知识库/docs/对象模型.md`「只读投影」
> 调研: `docs/superpowers/research/2026-08-24-soit-mcp-options.md`
> 目标: 让用户自己的 Coding Agent（Kimi Code / Claude Code / Cursor）只读读取 Soit 卡片宇宙。

## 摘要

P0 交付 `soit mcp serve` **stdio 子命令**：新行分隔 JSON-RPC 2.0，提供 5 个只读工具，
直接以只读连接打开 `vault/.soit/universe.db`。**无新 Cargo 依赖**（沿用 `pdf_server.rs` 的
零依赖精神）。不写库、不造卡、不改 Obsidian。App 内嵌 loopback HTTP（随机 token）为 P1 后置。

## 1. 工具面（P0，只读）

| 工具 | 参数 | 返回 |
|------|------|------|
| `list_cards` | `{ status?, kind? }` | cards 数组（id/title/kind/parentId/status/question/stuck/next/unread） |
| `read_card` | `{ cardId }` | 单卡字段 + 该卡 turns |
| `list_turns` | `{ cardId }` | 该卡 turns（id/title/user/aiHtml/think/starred） |
| `read_turn` | `{ cardId, turnId }` | 单 turn |
| `search_cards` | `{ query }` | title/question/stuck/next 大小写不敏感子串匹配的 cards |

- 所有工具返回 `content: [{ type:"text", text: <JSON> }]`；失败 `isError:true` + 短错误文本。
- 数据面复用 `Universe::snapshot()`（cards + turns + edges），P0 内存过滤；定向 SQL 读取留 P1。
- `aiHtml` 原样返回（HTML）；agent 自行决定如何处理。

## 2. 协议（stdio JSON-RPC 2.0）

- 帧：**新行分隔 JSON**（每行一个 JSON-RPC 消息；非 LSP Content-Length）。
- 请求处理：
  - `initialize` → `{ protocolVersion, capabilities:{ tools:{} }, serverInfo:{ name:"soit", version } }`
  - `notifications/initialized`（通知，不回复）
  - `tools/list` → `{ tools:[ { name, description, inputSchema } ] }`
  - `tools/call` → 工具执行结果
  - `ping` → `{}`
- 未知方法 → JSON-RPC error `-32601`；解析失败 → `-32700`；参数错 → `-32602`。

## 3. Rust 结构

| 文件 | 内容 |
|------|------|
| `src-tauri/src/mcp/mod.rs` | `pub fn run_stdio_serve(vault: &Path) -> Result<(), String>`；stdio 循环 + 分派 |
| `src-tauri/src/mcp/jsonrpc.rs` | 最小 JSON-RPC 2.0 消息类型 + 帧读写 + 单测 |
| `src-tauri/src/mcp/tools.rs` | 工具 schema + 处理器（读 snapshot 过滤）+ 单测 |
| `src-tauri/src/universe/mod.rs` | 新增 `pub fn open_readonly(&Path) -> Result<Self, String>` |
| `src-tauri/src/main.rs` | `mcp serve --vault <path>` 子命令分派 |
| `src-tauri/src/lib.rs` | `pub mod mcp;` |

## 4. 只读打开（`Universe::open_readonly`）

- 同 `open` 的前置校验（绝对路径 / exists / is_dir / canonicalize）。
- **不** `create_dir_all(.soit)`、**不** `PRAGMA journal_mode=WAL`、**不** `migrate()`。
- `Connection::open_with_flags(db, OpenFlags::SQLITE_OPEN_READ_ONLY)`。
- 校验 `schema_version`：缺失 → `"not a Soit universe"`；> `SCHEMA_VERSION` → 拒开；否则 Ok。
- `snapshot()` 已只读，可直接复用。

## 5. 入口契约

```
soit mcp serve --vault "<abs vault path>"
```

- `--vault` 必填；缺失 → stderr 错误 + 非零退出。
- 从 lastVault 自动解析为 P1（需 app_config_dir 解析，无 AppHandle）。
- 二进制名：dev `app.exe` / 打包 `Soit.exe`。

## 6. 安全

- 只读连接 = 结构性无写（无任何写工具、无裸 SQL）。
- stdio 继承用户身份；客户端 spawn 即用户自己信任的应用。
- 工具描述中性、不注入指令；结果默认给全量字段（P1 可加 cap）。
- 无 HTTP 面（P0）→ 无 token / Origin 议题。

## 7. 验收

- [ ] `cargo test`（src-tauri）全绿，含：`open_readonly`（缺 schema 拒 / 未来版本拒 / 只读可 snapshot）、jsonrpc 帧往返、5 个工具对临时 vault 的输出
- [ ] `cargo check` 通过；无新增 Cargo 依赖
- [ ] 手测：`cargo run -- mcp serve --vault <tmp vault>` 管道 `initialize`/`tools/list`/`tools/call` 往返
- [ ] 生产文件 ≤800 LOC

## 8. 非目标（本切片）

- App 内嵌 loopback HTTP / token / 设置开关（P1）
- 写工具 / 裸 SQL / resources / prompts / sampling
- 真流式 / 多客户端会话
- lastVault 自动解析
- 前端设置 UI
