# Soit 对外只读 MCP 接口 — 技术选型调研

> 日期: 2026-08-24
> 范围: 只调研与写作，不改代码、不装依赖。所有结论均基于一手来源（官方文档 / GitHub 源码 / 官方博客），链接见正文。
> 现状依据: `docs/superpowers/specs/2026-08-20-agent-dual-track-spec.md`（v1.2，§7 明确「Soit 作为 Claude/Cursor 的 MCP 主入口为反向、可后置」）。

---

## 1. 结论摘要（TL;DR）

- 三大目标客户端 **Kimi Code、Claude Code、Cursor 均已原生支持 MCP 的 stdio 与 Streamable HTTP 两种传输**，配置格式互相兼容（`mcpServers` JSON）。Kimi Code 官方文档确认支持 stdio 命令注册与 HTTP URL 注册（[Kimi Code 官方文档](https://www.kimi.com/code/docs/kimi-code-cli/customization/mcp.html)）。
- **推荐方向：方案 A（内嵌只读 MCP server）+ 方案 C 的否定结论**。用官方 Rust SDK `rmcp`（与 Tauri 同为 Rust/tokio，可进同一二进制）实现：桌面版内置 loopback Streamable HTTP 端点（随机 token 认证）+ 发布 `soit mcp serve` stdio 子命令兜底。工具面只读（`list_cards` / `read_card` / `list_turns` 等），不提供任何写工具。
- **不要走「把 universe.db 直接交给通用 SQLite MCP」**：官方 `@modelcontextprotocol/server-sqlite` 参考服务器**已归档**，且含 `write_query`/`create_table` 写工具、无只读模式（[servers-archived 源码](https://github.com/modelcontextprotocol/servers-archived/blob/main/src/sqlite/src/mcp_server_sqlite/server.py)）。
- 先例（Obsidian REST 插件、Screenpipe、Anytype）验证了「桌面应用本地数据 → 外部 agent」的通行模式：**应用内起本地服务 + API key/token + MCP 桥**；痛点集中在用户要手动开应用/插件、复制 token、以及 Claude Desktop 不原生支持 HTTP（需 `mcp-remote` 桥）。
- 与双轨 spec 契合：本接口是 spec 预留的「反向后置」方向，只读数据面不挑战 `universe.db` 权威，不写库、不造卡片；与副轨 handoff（正向调用外部 agent）互不冲突，可复用 brief/只读视图。

---

## 2. 传输与接入面

### 2.1 官方两种传输

MCP 规范（2025-06-18 版）定义两种标准传输（[规范 transports 页](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)）：

- **stdio**：客户端把 MCP server 作为子进程启动，经 stdin/stdout 传 JSON-RPC（换行分隔，stdout 不得混入非协议输出）。**单客户端**、无网络暴露面。
- **Streamable HTTP**：server 是独立进程，单一 HTTP 端点同时接受 POST（发消息）与 GET（开 SSE 流），支持会话（`Mcp-Session-Id`）与多客户端。官方给出三条安全要求：**校验 `Origin` 头防 DNS rebinding、本机场景只绑 127.0.0.1、必须实现认证**。
- 旧 HTTP+SSE 传输自 2024-11-05 起被 Streamable HTTP 取代，但仍兼容（[同上](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)）。
- 生态正在切换到大版本：**2026-07-28 版规范已发布**（无状态核心、`server/discover`、Tasks 扩展；sampling/roots/logging 进入弃用期），TS SDK v2 与 rmcp 3.x 已跟进，并保持对 2025-11-25 及更早版本的兼容（[rust-sdk README](https://github.com/modelcontextprotocol/rust-sdk)）。对 Soit 而言选 SDK 时认准「兼容旧版」即可，不必追最新规范。

### 2.2 各客户端配置方式

**Kimi Code（用户主用，重点）**（[官方文档](https://www.kimi.com/code/docs/kimi-code-cli/customization/mcp.html)）：

- 三种接入：**stdio**（`command` + `args`）、**HTTP**（`url` 字段，即 Streamable HTTP）、**SSE**（`transport: "sse"` 显式声明，仅用于旧式端点）。
- 配置写在 `mcp.json` 两层：用户级 `~/.kimi-code/mcp.json`（或 `$KIMI_CODE_HOME/mcp.json`）、项目级 `.kimi-code/mcp.json`（同名条目项目级覆盖）。TUI 内 `/mcp-config` 可交互配置，`/mcp` 查看连接状态。
- 字段：stdio 支持 `env`/`cwd`；HTTP/SSE 支持 `headers` 与 `bearerTokenEnvVar`（存放 bearer token 的环境变量名）——**这意味着 Soit 的 token 认证可直接映射**。另有 `startupTimeoutMs`/`toolTimeoutMs`、工具白名单 `enabledTools`。
- 安全默认：项目级 stdio 条目在**未信任工作区**不执行，信任提示会展示命令与 URL；MCP 工具按 `mcp__<server>__<tool>` 命名，可用通配权限规则（`[[permission.rules]]`）预置 allow/deny。
- CLI 子命令 `kimi mcp add <name> [target_or_command]`（含 `--transport`、`--auth oauth`）见[命令参考](https://www.kimi.com/code/docs/kimi-code-cli/reference/kimi-mcp.html)。

**Claude Code**（[官方文档](https://docs.claude.com/en/docs/claude-code/mcp)）：

- stdio：`claude mcp add <name> -- <command> [args...]`；远程 HTTP：`claude mcp add --transport http <name> <url> --header "Authorization: Bearer <token>"`。
- JSON 配置在项目 `.mcp.json` / 用户 `~/.claude.json`；**注意**：JSON 条目里含 `url` 必须显式写 `"type": "http"`，否则被当作 stdio 而跳过。项目级 `.mcp.json` 需用户批准（workspace trust）。

**Claude Desktop**：无 `claude mcp add` 命令（那是 Claude Code 的），只有 `claude_desktop_config.json`（macOS `~/Library/Application Support/Claude/`，Windows `%APPDATA%\Claude\`）的 `mcpServers` JSON，**仅支持 stdio**；连 HTTP server 需 `mcp-remote` 桥（[Obsidian REST 插件 README 的 Claude Desktop 配置示例](https://github.com/coddingtonbear/obsidian-local-rest-api)）。

**Cursor**（[官方文档](https://docs.cursor.com/en/context/model-context-protocol)）：

- 三种传输：stdio（本地 shell 命令）、SSE、Streamable HTTP（URL，OAuth）。
- 配置：项目 `.cursor/mcp.json`、全局 `~/.cursor/mcp.json`。stdio 条目 `type/command/args/env`；远程条目 `url` + `headers`。支持 `${env:NAME}`、`${userHome}` 等插值。

---

## 3. SDK / 生态盘点

| SDK | 传输支持 | 成熟度 / 现状 | 许可 |
|---|---|---|---|
| TypeScript `@modelcontextprotocol/server`（v2）/ `@modelcontextprotocol/sdk`（v1.x） | stdio + Streamable HTTP（+ Express/Fastify/Hono 中间件） | **v2 已是稳定线**（对齐 2026-07-28 规范）；v1.x 继续修 bug 与安全补丁 ≥6 个月。多数 Node 参考服务器与桥接工具基于它 | 新贡献 Apache-2.0，旧代码 MIT（[repo](https://github.com/modelcontextprotocol/typescript-sdk)） |
| Python `mcp` SDK | stdio + SSE + Streamable HTTP | 1.x→2.0 有 breaking（低层 `Server.list_tools` API 被移除，mcp-obsidian 因此钉死 1.x） | MIT（[mcp-obsidian README](https://github.com/MarkusPfundstein/mcp-obsidian)） |
| **Rust `rmcp`**（官方） | **stdio + SSE + Streamable HTTP**，tokio；`#[tool]` 宏生成工具 | **官方 SDK**，3.x（README 有 3.x 迁移指南），3.8k stars，活跃；已实现 2026-07-28 能力并兼容 2025-11-25/更早 | MIT → Apache-2.0 迁移中（[repo](https://github.com/modelcontextprotocol/rust-sdk)、[LICENSE](https://raw.githubusercontent.com/modelcontextprotocol/rust-sdk/main/LICENSE)） |
| 第三方 Rust crate（`tower-mcp`、`mcp-server` 等） | 各异 | 存在但碎片化、无官方背书；未找到与 rmcp 同级的权威维护证据 | — |

**对 Soit 的结论**：Soit 后端是 Rust/Tauri，`rmcp` 是唯一「官方 + 同语言 + 双传输」的选择，且可作为 crate 编进 Soit 二进制（`cargo add rmcp --features server`），无需 Node/Python 运行时。若未来要做纯 Node 的桥接小程序（如 Screenpipe 的 `npx` shim），再用 TS SDK。
另注：`mcpo`（[open-webui/mcpo](https://github.com/open-webui/mcpo)）是反向工具——把 stdio MCP server 包装成 OpenAPI REST 端点（MIT），方向与 Soit 相反，仅在「用户 agent 只想用 REST」时作为可选桥参考。

---

## 4. 先例模式

### 4.1 Obsidian 生态（Soit 的直接参照系）

- **[MarkusPfundstein/mcp-obsidian](https://github.com/MarkusPfundstein/mcp-obsidian)**：Python 版 stdio MCP server（`uvx mcp-obsidian`），**架构 = Obsidian Local REST API 社区插件 + 外部 stdio 桥**。要求用户手动安装并开启 REST 插件、复制 API key，再经环境变量 `OBSIDIAN_API_KEY/HOST/PORT`（默认 127.0.0.1:27124）传给 server。痛点：手动开插件、key 传输、Python 运行时依赖。
- **[jacksteamdev/obsidian-mcp-tools](https://github.com/jacksteamdev/obsidian-mcp-tools)**：Obsidian 插件 + 签名的本地 MCP server 二进制（SLSA provenance），一键安装并自动写 Claude Desktop 配置，同样依赖 REST 插件。**项目已于近期归档**（README 明示，87k 装机后停更，社区有 5+ 替代品）。
- **[coddingtonbear/obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api)**（最值得抄的成熟样本）：HTTPS（自签证书）+ Bearer API key，默认端口 27124（HTTPS）/27123（HTTP）；**现已内置 Streamable HTTP MCP server（`/mcp/`，Bearer 认证）**，并在 README 给出各客户端（Claude Code `claude mcp add --transport http`、Cursor `url+headers`、Claude Desktop 需 `npx mcp-remote` 桥）的完整配置。它同时是「手动开插件 + 端口 + token」痛点的答案与来源。

**通行模式总结**：`桌面应用内本地服务（带 token） ← 外部 MCP server 桥（stdio 或直接 HTTP） → agent 客户端`。用户接入成本 = 开应用/插件 + 拿到 token + 加一条客户端配置。

### 4.2 Tauri / 桌面应用先例

- **[Screenpipe](https://github.com/mediar-ai/screenpipe)**（Tauri/Rust 桌面应用，19k+ stars）：最完整的同类先例。桌面 daemon 在 `localhost:3030` 提供 REST API，**内置 MCP server**（[docs](https://docs.screenpi.pe/ai-memory)），另发 `npx screenpipe-mcp` 的 stdio shim 把请求转发到 3030（[docs](https://docs.screenpi.pe/for-developers)）——即「内置 HTTP + stdio 桥」双形态。
- **[Anytype](https://github.com/anyproto/anytype-mcp)**：官方 MCP server（stdio，`npx @anyproto/anytype-mcp`），需要 Anytype 桌面应用正在运行 + 用户取 app key——「应用即数据服务」的又一例证。
- Tauri 插件形态：`delorenj/tauri-mcp-server`（[repo](https://github.com/delorenj/tauri-mcp-server)）、`dirvine/tauri-mcp`（[repo](https://github.com/dirvine/tauri-mcp)）等，多为「让 agent 调试/驱动 Tauri 应用」方向（tauri-driver/IPC），不是「暴露应用自身数据」的成熟产品先例。
- zeta-note 是否内置 MCP：**未找到权威来源**（其仓库与文档未见 MCP 功能证据）。

---

## 5. 候选架构

### 方案 A（推荐）：内嵌只读 MCP server（rmcp）

单二进制内置：`rmcp` 以 `--features server` 编入 Soit；Streamable HTTP 只绑 `127.0.0.1`，随机端口 + 随机 bearer token（设置页可见可复制/重置）；同时发布 `soit mcp serve` stdio 子命令（读取配置中的 vault 路径，直接开 `universe.db` 只读）。

- **实现面**：与 Tauri 同进程（HTTP 端点作为应用内 task 运行，app 关闭即消失）或独立子进程皆可；工具集为固定只读视图（`list_cards` / `read_card` / `list_turns` / `read_turn` / `search_concepts`），不暴露裸 SQL。进同一 crate 无需新增运行时；`soit mcp serve` 复用现有 universe 读取层。
- **安全面**：只读工具 + loopback 绑定 + token（对齐规范[transports 页](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)三条要求）；stdio 形态继承用户身份（见 §6）。
- **接入成本**：Kimi Code/Cursor/Claude Code 一条配置即可（HTTP 带 `bearerTokenEnvVar` 或 stdio 带 `soit mcp serve`）；Claude Desktop 需 `mcp-remote` 桥（通行痛点，可接受）。
- **双轨契合**：即 spec「反向后置」方向；只读不触碰卡片权威；与 handoff 副轨共用只读数据面，不冲突。
- 冷启动约束：MCP 端点**不在 bootstrap 开启**，应用启动后按需（设置开关，默认关）拉起。

### 方案 B：自研 loopback REST + agent 用 fetch（不做 MCP）

- **实现面**：更省（一个 Rust HTTP handler，无需协议栈），但每个 agent 都要手写 fetch 代码/技能，失去 MCP 的工具发现与权限体系。
- **安全面**：与 A 的 HTTP 部分相同（loopback + token）。
- **接入成本**：最高——用户 agent 端无标准配置位，只能靠 prompt/skill 约定。
- **契合度**：与「方便外部 agent 只读查询」目标相悖；仅作为 A 落地前的过渡或 debug 接口有价值。

### 方案 C：universe.db 直连通用 SQLite MCP（否决，除非自建）

- 官方 `@modelcontextprotocol/server-sqlite` **已归档**（[servers README](https://github.com/modelcontextprotocol/servers)），工具含 `write_query`/`create_table`，**无只读模式**（[源码](https://github.com/modelcontextprotocol/servers-archived/blob/main/src/sqlite/src/mcp_server_sqlite/server.py)），stdio-only。直接把库交给它会带来写风险，且 agent 面对的是裸表结构而非产品语义（卡片/回合/边）。
- 若坚持 SQL 直读，应**自建**只读封装（`sqlite3_open_v2` 只读标志 + 白名单 SELECT 视图），把它作为方案 A 工具集的一个可选工具，而不是整体方案。

---

## 6. 安全考量

- **暴露私有对话是本方案最大风险**。缓解：① 接口严格只读，不提供任何文件/库写工具；② Streamable HTTP 只绑 `127.0.0.1` + 校验 `Origin` + 随机 token（规范明确要求，[transports 页](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)）；③ 默认关闭、需用户在设置中开启。
- **stdio 的信任模型**：官方信任模型明确——stdio server 由客户端 spawn、**以用户同等级权限运行**，本地 MCP server「与你安装的任何软件同等信任」；客户端配置的命令执行本身是设计行为而非漏洞（[官方 SECURITY.md](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/SECURITY.md)、[community/security](https://modelcontextprotocol.io/community/security)）。对 Soit 的含义：`soit mcp serve` 是我们自己的签名二进制，信任面 = 应用本身，风险可控。
- **工具投毒（tool poisoning）**：规范将工具描述视为不可信输入（[规范 Security 节](https://modelcontextprotocol.io/specification/2025-06-18)），官方另有[安全最佳实践](https://modelcontextprotocol.io/specification/draft/basic/security_best_practices)。Soit 作为 server 应保证工具描述中性、不注入指令；工具**结果**是 agent 的输入，soit 侧应默认脱敏（如 cardId/turn 正文可选截断）。
- **CVE 勘误**：任务书提到的 **CVE-2025-1061 与 MCP 无关**——它是 WordPress 插件 Nextend Social Login Pro 的认证绕过（[GitHub Advisory GHSA-hhgg-847r-8x22](https://github.com/advisories/GHSA-hhgg-847r-8x22)）。MCP 相关的真实案例是：filesystem 参考服务器的路径穿越（CVE-2025-53109/53110，[Cymulate 分析](https://cymulate.com/blog/cve-2025-53109-53110-escaperoute-anthropic/)）与 Git 参考服务器的 CVE-2025-68143/68144/68145。教训一致：**边界校验（路径/前缀）必须自己做，不能信 agent 输入**——Soit 的只读视图恰好天然免疫写路径攻击，但需防「读越界」（如跨卡读取、超限导出）。
- **Obsidian 的 API key 模式**（Bearer + 可选 HTTPS 自签证书）在[插件 README](https://github.com/coddingtonbear/obsidian-local-rest-api)有完整描述，可作为 Soit token 发放 UX 的直接参照。

---

## 7. 建议的下一步（供决策）

1. 在共识/双轨 spec 补一条「反向只读 MCP 接口」的边界声明（只读、不写库、默认关闭）。
2. 以 rmcp 起一个最小 spike：`soit mcp serve`（stdio）+ loopback HTTP，工具先只做 `list_cards`/`read_card`，用 Kimi Code 的 `mcp.json` 实测接入。
3. 用 MCP Inspector（[参考](https://github.com/MarkusPfundstein/mcp-obsidian)）做 stdio 调试闭环。
