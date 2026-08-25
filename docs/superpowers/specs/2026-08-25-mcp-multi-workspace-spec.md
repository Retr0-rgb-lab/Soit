# MCP 多工作区(注册表 / 惰性打开 / 数据权限)— Spec v1.1

> 日期: 2026-08-25
> 依据: 用户反馈「MCP 指定单一工作区,换库要重配 MCP」;`知识库/docs/共识.md`(一 vault 一宇宙、本机、冷启动不扫盘);SessionConfig v1(`lastVault` + `recentVaults`≤8,Host 权威);`2026-08-25-mcp-read-ergonomics-spec.md` v1.1(已落地 render/分页/元数据)
> 基线分支: `main`(HEAD = 5d0da3e)
> 前置依赖: MCP P0(245a359)+ read-ergonomics(e63137c);`soit-session.json` 已有 recents 注册表

---

## 摘要

今日 `soit mcp serve` 硬编码单 vault(`main.rs::run_mcp`,`--vault` 必填缺则 exit)。用户访问另一工作区必须重配 MCP 客户端。本 Spec 引入 **工作区注册表**:`--vault` 可多次/逗号(显式)+ 无 `--vault` 时自动读 `soit-session.json` 的 `recentVaults`(用户开过的库);新增 `list_workspaces` / `select_workspace` 工具;既有 5 工具加可选 `vault` 参数。**权限 = 注册表白名单**:不扫盘发现、注册表外默认拒绝、`--allow-any` 显式放开。一库一宇宙隔离天然继承,数据不串。

## 0. 前置依赖

| 已有 | 路径 |
|------|------|
| MCP stdio loop | `src-tauri/src/mcp/mod.rs`(`run_stdio_serve(vault)` 单库) |
| CLI 解析 | `src-tauri/src/main.rs::run_mcp`(单 `--vault`) |
| SessionConfig recents | `src-tauri/src/session_config.rs`(`normalize_recent_vaults` / `migrate_session_value` / `SessionConfigDto`) |
| config 路径 | `session_config.rs::config_path(app: &AppHandle)` —— **MCP CLI 进程无 AppHandle,需独立解析**(本 Spec §2.0) |
| Universe | `open_readonly(vault: &Path) -> Result<Self>`;`snapshot()` 全量(性能 P1 问题已在 read-ergonomics §7 声明,不在本 Spec) |
| 工具面 | `tools.rs` 5 工具 + `call_tool(name, args, universe: &Universe)` |

## 1. 现状

| 缺口 | 证据 |
|------|------|
| 单 vault 硬编码 | `main.rs:19-43` 只收一个 `--vault`;`mod.rs::run_stdio_serve` 打开一个 `Universe::open_readonly` |
| 换库重配 | MCP 客户端 config 写死 `--vault <path>`,换工作区 = 改配置重启 |
| recents 数据已有但 MCP 不用 | `soit-session.json` 的 `recentVaults` 由 Host 维护,MCP 进程未读 |
| CLI 进程无 AppHandle | `config_path(app)` 依赖 Tauri 运行时;MCP 是 `app.exe mcp serve` 裸进程 |

## 2. 需要做的工作

### 2.0 config dir 独立解析(P0)

MCP 进程定位 `{app_config_dir}/soit-session.json`(identifier = `lab.soit.app`,tauri.conf.json 权威):

- 方案:**加 `dirs = "6"` crate 依赖**(纯 Rust,无系统库,不踩 libdbus/openssl 类坑)
- 规则(对齐 Tauri `app_config_dir` 语义):
  - Windows: `%APPDATA%\lab.soit.app`
  - Linux: `$XDG_CONFIG_HOME` 或 `~/.config` + `/lab.soit.app`
  - macOS: `~/Library/Application Support/lab.soit.app`
- 实现位置:新 `src-tauri/src/mcp/config_dir.rs`(或 session_config.rs 加 `pub fn session_config_path_no_app() -> Option<PathBuf>`;由 fixer 二选一,倾向后者复用现有常量)
- 读不到文件/解析失败 → 空 recents,静默降级(不 crash),`list_workspaces` 返回显式 `--vault` 部分

### 2.1 CLI(P0)

`main.rs::run_mcp` 重写:

```
soit mcp serve                        # 注册表 = recents(∪ 无显式则空)
soit mcp serve --vault A --vault B    # 重复 --vault;或 --vault A,B(逗号分隔)
soit mcp serve --vault A              # 旧行为:注册表={A},默认=A(完全兼容)
soit mcp serve --allow-any            # 注册表外任意路径放行
```

- 注册表 = 显式 `--vault`(保序去重,不截断)在前 + recents 去重补齐,总量 cap 8(复用 `normalize_recent_vaults` 的 cap;显式优先保证用户指定的都在)
- 默认选中:第一个显式 `--vault`;无显式则 `lastVault`(若在注册表);否则 None
- `--vault` 相对路径 → 启动报错(与 `open` 一致,须绝对路径)

### 2.2 Registry(P0)

`mcp/mod.rs` 重构:

```rust
pub struct McpState {
  registry: HashMap<PathBuf, Universe>,   // 惰性打开 + 缓存
  allow: Vec<PathBuf>,                     // 白名单(注册表,已 canonicalize)
  allow_any: bool,
  selected: Option<PathBuf>,               // select_workspace 会话态
}
```

- `run_stdio_serve(config: McpServeConfig)`:`--vault` 显式路径启动即 canonicalize 入白名单;**recents 路径惰性**(首次引用才 open_readonly,失败给带 vault 路径的可读错误)
- `resolve_vault(args) -> Result<&mut Universe>`:参数 `vault` > `selected` > 白名单唯一库 > 错误「多工作区未选择,先 list_workspaces / select_workspace」
- **白名单匹配安全**:白名单条目与请求 vault 在比较前都 `dunce::canonicalize`;canonicalize 失败 → 拒绝。recents 原始串只在命中比较时 canonicalize(不提前 IO)。防 `..`/symlink 逃逸 + Windows 大小写不一致。
- 单线程 stdio loop,无锁

### 2.3 工具(P0)

新增 2 个,共 7 个:

| 工具 | 参数 | 返回 |
|------|------|------|
| `list_workspaces` | — | `[{path, label(叶子名), isLast}]`(纯注册表,零 DB IO;空数组合法) |
| `select_workspace` | `path`(必填) | `{ok, path}`;白名单外且非 allow-any → 可读错误 |

既有 5 工具:加可选 `vault` 参数(inputSchema 同步);`call_tool` 经 `resolve_vault` 取 Universe;错误消息统一含 `list_workspaces` 提示。

### 2.4 测试与文档(P0/P1)

- `mcp/mod.rs` 测试:注册表合并、默认选中优先级、未 select 多库报错、vault 参数覆盖、select 会话态、allow-any、空注册表错误、惰性打开失败可读
- `main.rs` 无测试(CLI 解析;`cargo test` 在 Windows 验证)
- `src-tauri/AGENTS.md`:MCP 段补多工作区契约
- `~/.agents/skills/soit-writeNotes/SKILL.md`:流程第 1 步加「`soit_list_workspaces` 定位库 → `soit_select_workspace(path)`」,后续调用不变

## 3. 文件变更清单

| 文件 | 变更 | 节 |
|------|------|-----|
| `src-tauri/Cargo.toml` | + `dirs = "6"` | 2.0 |
| `src-tauri/src/session_config.rs` | + 无 AppHandle 的 `soit-session.json` 路径读取 helper | 2.0 |
| `src-tauri/src/main.rs` | run_mcp 多 vault/allow-any/recents 解析 | 2.1 |
| `src-tauri/src/mcp/mod.rs` | McpState registry + resolve_vault + 2 新工具分发 + **现有测试签名重写(`&Universe`→`&mut McpState`)** | 2.2 2.3 |
| `src-tauri/src/mcp/tools.rs` | 5 工具 + vault 参数 + list_workspaces/select_workspace + inputSchema | 2.3 |
| `src-tauri/AGENTS.md` | MCP 多工作区契约 | 2.4 |
| `~/.agents/skills/soit-writeNotes/SKILL.md` | 开头加 workspace 选择 | 2.4 |

**不改:** `universe/*`、DB schema、FE、IPC commands、read-ergonomics 转换器。

## 4. 架构图

```text
soit mcp serve [--vault A --vault B] [--allow-any]
        │
        ├─ recents(soit-session.json,dirs::config_dir + identifier)
        │      ∪ explicit --vaults → normalize → 白名单
        ▼
McpState { registry: HashMap<PathBuf, Universe>, selected, allow_any }
        │
        │ tools/call
        ▼
resolve_vault(args):
  args.vault > selected > 唯一白名单库 > 错误(list_workspaces 提示)
        ▼
Universe::open_readonly(惰性,失败带 path) → snapshot → 既有 5 工具
```

## 5. 实施顺序

| 阶段 | 任务 | 依赖 | 工作量 |
|------|------|------|--------|
| W1 | N1 config dir + CLI 解析(main.rs/session_config/Cargo.toml) | — | 0.3d |
| W2 | N2 McpState registry + resolve_vault(mod.rs) | N1 | 0.4d |
| W2 | N3 tools 参数化 + 2 新工具(tools.rs) | N2(mod.rs 与 tools.rs 串行同一波) | 0.3d |
| W3 | N4 文档 + skill + 测试补全 + verify | N2 N3 | 0.3d |

N1 与 N2 串行(main.rs 构造 McpServeConfig 依赖 mod.rs 新签名)。总 ~1.3d,单 fixer 可承载;拆 2 fixer(N1→N2N3 → N4 按阶段串行,复用 session)。

## 6. 验收标准

- [ ] `soit mcp serve --vault A` 行为与旧版完全一致(单库 + 默认,工具无 vault 参数可用)
- [ ] `--vault A --vault B`(及逗号形式)注册表 = {A,B},默认 A
- [ ] 无 `--vault`:注册表 = recents(≤8);默认 = lastVault;`list_workspaces` 返回全部 + isLast 标记
- [ ] 未 select 多库时,`list_cards` 报可读错误含「list_workspaces」
- [ ] `select_workspace(B)` 后,后续 5 工具无 vault 参数全部走 B;`vault=A` 参数可单次覆盖
- [ ] 白名单外路径(非 allow-any)select/read → 拒绝;`--allow-any` 下任意绝对路径可读
- [ ] 注册表内路径不存在/无 universe.db → 首次引用报可读错误(含 path),不 crash,其他库不受影响
- [ ] `list_workspaces` 零 DB IO(空库/多库均瞬时)
- [ ] recents 文件缺失/损坏 → 空注册表,不 crash
- [ ] 相对路径 `--vault` → 启动错误
- [ ] `tools/list` 返回 7 个工具(list_workspaces / select_workspace 新增)
- [ ] 现有 `mod.rs` dispatch/handle_line 测试签名改 `&mut McpState` 后仍全绿
- [ ] `cd src-tauri && cargo test`(Windows);本机 Linux 用 stub 验证行为(沿用 read-ergonomics 经验)
- [ ] `npm test` / `npm run build` 绿(无 FE 改动,回归确认)
- [ ] skill 第 1 步含 list_workspaces → select_workspace

## 7. 不在范围

- 磁盘扫描发现 vault(冷启动不扫盘原则;发现即越权)
- `list_workspaces` 带 cardCount/turnCount 统计(需打开 DB,P1;可 `withStats=true` 后置)
- recents 之外的持久工作区收藏(MCP 只读 session 文件,不写)
- MCP 写工具(保持只读)
- `snapshot()` 按需化(read-ergonomics §7 已声明 P1)
- 多客户端会话隔离(stdio 单客户端天然隔离)
- vault 别名/短名解析(用完整 path,list_workspaces 的 path 直接回传)

## 8. 风险

| 风险 | 缓解 |
|------|------|
| Tauri `app_config_dir` 语义与 dirs 拼接差异(平台) | 三平台规则写死 + Windows 验收;`dirs` 6.x 纯 Rust 无系统库坑 |
| dirs 6 MSRV | 确认 ≥ rust 1.77.2(Cargo.toml `rust-version = 1.77.2`) |
| selected 会话态进程重启丢失 | stdio 客户端重连需重 select;文档注明,不持久化 |
| 惰性打开慢库阻塞 stdio loop | 单机本地 SQLite,open_readonly 毫秒级;P0 接受 |
| 过期路径污染注册表 | 打开失败可读错误,不 crash;list_workspaces 纯注册表不 probe |
| recents 是「用户开过的」而非「用户授权的全部」 | 显式 --vault 补;这是设计选择(决策点 1) |
| CLI 参数向后兼容 | 单 --vault 路径 = 旧行为,验收第 1 条锁定 |

## 9. 版本变更

| 版本 | 说明 |
|------|------|
| v1.0 | 初稿:注册表、惰性打开、白名单权限、select 会话态、vault 参数覆盖 |
| v1.1 | Oracle APPROVE-WITH-MINOR:canonicalize 双向匹配安全规则、注册表 cap 措辞修正(显式优先)、mod.rs 现有测试重写入清单、dirs MSRV + select 重启丢失风险、tools/list 7 工具验收 |
