# Agent 双轨（Inquiry Chat + External Runtime）— Spec v1.2

> 日期: 2026-08-20（v1.2 补丁 2026-08-21）  
> 依据: `知识库/docs/共识.md` / `对象模型.md` / `非目标.md`；会话讨论「轻量探究对话 + 外部 coding agent 拓展」；OpenDesign adapter / ACP 调研；现状 `src/lib/chat/*` + `src/state/chatActions.ts`  
> 基线分支: `main`  
> 前置依赖: Host 耐久写穿（turn/card/spawn）；Settings 壳（空间/模型/技能/关于）；ChatPort Mock + OpenAI-compat BYOK；Skills 文本注入；deepenScope v2  
> Oracle: v1.0 → v1.1（spawn 安全冻结、brief 信任边界、IA/文件清单、验收补全）→ v1.2（§7 允许主轨有界 Host 工具；见 inquiry-tools-search spec）

---

## 摘要

Soit 不自研完整 coding Agent Core，而落地 **双轨 Agent 系统**：主轨 **Inquiry Chat**（一卡一上下文、深挖 scope、概念标记、BYOK/Mock）做强；副轨 **External Runtime Bridge**（导出 brief → mock handoff 必交 / 可选真 CLI → 结果写回 turn/residue）。卡片真相仍在 `vault/.soit/universe.db`；Obsidian 只做沉淀层。本切片交付可验收的主轨硬化 + brief 闭环 + Host runtime 检测/prefs + **mock handoff** 全路径；真 CLI 为 P1 不阻塞验收。不为子 Agent 舰队或 Soit-as-plugin。

---

## 0. 前置依赖

| 已有 | 路径 / 说明 |
|------|-------------|
| ChatPort 单次 complete | `src/lib/chat/port.ts` — `complete({ cardId, messages, scope }) → { text, marks? }` |
| Mock / OpenAI-compat | `mockChat.ts` / `openaiCompat.ts`；`resolvePort` 有 Key→openai 否则 mock |
| BYOK 配置 | Host `soit-chat.json` + FE localStorage 镜像；设置「模型」段 |
| 发送/重生编排 | `src/state/chatActions.ts`：universe 先 `append_turn` 再 complete 再 `update_turn`；失败不造幽灵回合 |
| Skills 注入 | `turnHelpers.withSkillsSystem` → `get_enabled_skills_text` |
| 深挖 scope | `lib/deepenScope.ts` + `scopeForCard`：父状态+span+why+子卡 recentTurns，**无**父 transcript |
| 卡片存储 | `vault/.soit/universe.db`（SQLite）；非一卡一 md |
| 设置壳 | `SettingsPanel` 四段；Composer chip 仅跳转模型设置 |
| 冷启动约束 | bootstrap 不开 DB；无首屏 CDN 字体；无模型网络于 bootstrap |

---

## 1. 现状

### 1.1 产品缺口

| 缺口 | 证据 |
|------|------|
| 共识仍写「单 Agent + 工具」，未区分 Inquiry vs Runtime | `共识.md` §8 |
| 无流式、无取消、无进行中锁 | `ChatPort.complete` 一次性 Promise；Composer 无 abort |
| 无卡片 brief 导出/导入 | 无 `cardBrief` 模块 |
| 无外部 runtime 概念 | 无 detect/list/spawn；无 ACP |
| Skills 仅文本贴 system | `skills.rs`：`get_enabled_skills_text` 注释 “Wave C consumes later”；无 tool loop |
| 前端 fetch 直打模型 | `openaiCompat.ts` 在 WebView 发网；Rust 不参与推理；CSP `connect-src` 已放行 https/localhost |
| `append_turn` 可用户-only | Host INSERT `ai_html=''`；user 非空即可 — 导入/handoff 可先落 user 再 `update_turn` |
| 无 shell 插件 | `Cargo.toml` 无 `tauri-plugin-shell`；进程只能将来自 **Rust command** |

### 1.2 代码事实（实现时勿假设已有）

- `PortKind = "mock" | "openai"` only（`chat/index.ts`）
- `ChatCompleteInput` **无** `signal`；`MockChat.complete` **无** delay/abort
- `appendUserMessage` / `regenerateTurn` 内联 complete，无共享 `runCompletion` 抽取（易分叉修 bug）
- `think` 字段滥用为「生成中…#gen」/「重生中…#gen」竞态标记，非真思维链
- `completeResultToHtml` 对空 `text` 返回 `""`（空白 AI，需管线层补文案）
- `SettingsSection` / `AppShell.parseSettingsSection` 仅四段；`soit:open-settings` detail 未识别 `runtime`
- Host 无 runtime 相关 command / permission；capabilities 为显式 allow 列表

### 1.3 存储边界（本 Spec 冻结）

| 数据 | 权威存储 | 非权威 |
|------|----------|--------|
| 卡片 / 边 / 回合 | `universe.db` | 外部 agent session 目录、Obsidian md |
| BYOK / lastVault / runtime 偏好 | App config dir（`soit-chat.json` / `soit-runtime.json` / session） | universe.db |
| 概念 / 残渣 | vault Markdown | 不得替代卡树 |
| Handoff 运行产物（日志、staged brief） | `vault/.soit/runs/<runId>/` | 用户笔记根目录乱写 |

---

## 2. 需要做的工作

### 2.0 共识补丁（P0，先文档后代码）

更新 `知识库/docs/共识.md`（及必要时 `对象模型.md` 一句）：

**拍板文案（冻结）：**

- Soit 是 **会话 Host**：卡片宇宙 + 探究语法权威在 Soit。
- **主轨 Inquiry Assistant**：卡内对话；BYOK 或 Mock；一卡一上下文；深挖/发散/重生不变。
- **副轨 External Runtime**：可选本机 coding agent（CLI/ACP）作 **执行后端**；不拥有卡片树。
- **禁止**：Soit 作为其他 Host 的插件为默认路径；外部 session 当作卡片源；v1 子 Agent 舰队 UI。
- v1「单 Agent + 工具」改为：**单探究助手 + 可选外部 Runtime（工具级 handoff）**。

### 2.1 主轨 Inquiry：共享 completion 管线（P0）

**问题：** send/regenerate 两套复制逻辑，后续 stream/cancel 会双倍烂。

**做：**

1. 抽取 `src/state/runCompletion.ts`（禁止继续在 `chatActions` 复制 complete 体）：
   - 输入：`cardId, turnId, messages, scope, gen, signal`
   - 步骤：`withSkillsSystem` → `resolvePort` → `complete({ ..., signal })` → 空文本则 `text = "（模型返回为空）"` → `completeResultToHtml` → universe 则 `update_turn` else `patchTurnAi`
   - **竞态（冻结）：** store 字段 `inquiryInflight: null | { cardId, turnId, gen, controller: AbortController }`；`stillCurrent()` **只**比对 `inquiryInflight.gen`（及 turn 仍存在）。`think` 仅 UI 文案（如 `生成中…`），**不再**作为唯一权威 token。
2. `appendUserMessage` / `regenerateTurn` 只负责准备 turn + messages + 登记 `inquiryInflight`，然后 `await runCompletion(...)`；`finally` 清理本 gen。
3. **进行中锁：** 若 `inquiryInflight` 或 `runtimeRun` 为进行中（staging/running），Composer **禁用发送**；同卡重生：取消旧 controller + 新 gen 覆盖 inflight（已有“新重生作废旧结果”语义）。
4. **取消（P0 最小）：**
   - `cancelInflight()`：abort controller + 将 `inquiryInflight` 置 null（迟到 complete 不得写 turn）
   - `ChatCompleteInput` 扩展可选 `signal?: AbortSignal`；OpenAI `fetch(..., { signal })`
   - Mock：loop/delay 检查 `signal.aborted`，abort 则 reject/`DOMException` abort
   - UI：生成中 Composer 主按钮变为「停止」→ `cancelInflight`

**非目标本条：** 真 token 流式 UI（接口可后续加 `completeStream`；**本切片不强制**）。

### 2.2 主轨 Inquiry：体验硬化（P0/P1）

| 项 | 级别 | 要求 |
|----|------|------|
| `[[term]]` 标记 | P0 已有 | 保持；单测覆盖多 term / 嵌套 |
| system 提示 | P0 | 抽到 `lib/chat/systemPrompt.ts`：角色 + 语言 + 标记约定；scope JSON 截断 ≤2000 保持 |
| 错误展示 | P0 | 用户可见短错误；不抛未捕获 |
| 空回复 | P0 | **在 `runCompletion`** 将空 text 替换为 `（模型返回为空）` 再 html 化 |
| Markdown 轻度 | P1 | **本切片可不做**完整 md；若做仅 `**`/`\n` 级，仍须 escape 后处理防 XSS |
| SSE/流式 | P1 后置 | 接口预留：`ChatPort.complete` 可后续扩 `completeStream`；**本切片不强制** |
| 模型请求改走 Rust | P2 后置 | 保持 FE fetch；文档注明 CORS/企业代理风险 |

### 2.3 Card Brief 构建器（P0）

**问题：** handoff 与导出需要稳定、可测的「任务单」，且遵守 deepen 不泄父 transcript。

**新建** `src/lib/cardBrief.ts`（纯函数 + 单测）：

```ts
export interface CardBrief {
  version: 1;
  exportedAt: string; // ISO
  cardId: string;
  title: string;
  status?: string;
  question?: string | null;
  stuck?: string | null;
  next?: string | null;
  kind?: string; // root|deepen|diverge
  /** child-only recent turns, plain text */
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** only when inbound deepen edge */
  deepen?: {
    parent: { title: string; status?: string; question?: string | null; stuck?: string | null; next?: string | null };
    span: { text: string; turnId?: string };
    why?: string;
  };
  skillsText?: string; // optional snapshot at export time
  vaultPath?: string | null;
  instructions: string; // fixed Soit handoff contract blurb
}

export function buildCardBrief(input: { ...store slices..., skillsText?: string, vaultPath?: string | null, messageCap?: number }): CardBrief
export function cardBriefToMarkdown(brief: CardBrief): string
export function parseAssistantImport(raw: string): { text: string; marks?: ChatMark[] } // reuse parseAssistantContent
```

规则：

- `messages` **仅本卡**；默认 cap 最近 **16** 回合（常量 `BRIEF_MESSAGE_CAP`）。（聊天 deepenScope `recentTurns` cap 仍为 **8** — 有意不同，brief 给外部 agent 稍多上下文。）
- deepen 块只含父 inquiry 字段 + span + why，**禁止**父 turns / 父 messages / 其他 cardId
- `buildCardBrief` 纯函数：单测必须构造「父卡有 turns」夹具并断言 brief JSON/MD **不出现**父 turn 正文
- `instructions` 固定中文短契约：结果用纯文本；可选用 `[[term]]`；不要假设已改 universe.db；不要创建 Soit 卡片 id
- **导出路径：** FE `buildCardBrief` 即可（demo/desktop）。
- **Handoff 路径信任边界（P0）：** `start_runtime_handoff` 入参为 `{ cardId, runtimeId }`（+ 可选 prefs）。Host（或 FE 在 invoke 前）必须用**同一套** `buildCardBrief` 规则从**当前宇宙该卡**生成 brief；若 FE 传 brief 体，Host 校验 `brief.cardId === cardId` 且 messages 不得带外来 card 元数据。写 `brief.md` 只进 `runs/<runId>/`。

### 2.4 Brief 导出 / 导入（P0 — Phase1 闭环）

**Store API：**

- `exportCardBrief(cardId?: focus): Promise<CardBrief>`
- `copyCardBriefMarkdown(cardId?): Promise<string>` — 返回 md；UI 写 clipboard
- `importAssistantToFocus(raw: string, opts?: { asResidue?: boolean }): Promise<void>`
  - **冻结：** 新 turn：`user` 固定为 `（导入自外部 Agent）`，`aiHtml` = `completeResultToHtml(parseAssistantContent(raw))`（**必须**走 escape，禁 raw HTML 导入）；universe → `append_turn` + `update_turn` 两步（无合并命令）
  - **上下文后果（有意）：** 该 user 行会进入后续 `messagesFromTurns`；可接受。勿用空 user（Host 拒绝）。
  - `asResidue: true` → 仅 `append_residue`，不改 turns；需已绑 vault

**UI：**

- 卡片菜单或 Composer 旁：「导出任务单」「粘贴导入」
- 导出成功 toast/tip；无 clipboard API 时文本域 fallback（WebView2 需用户手势）

**浏览器 demo：** 全内存可跑；universe 写穿已有路径。

### 2.5 Runtime 注册表与检测（P0 骨架）

**类型** `src/lib/runtime/types.ts`：

```ts
export type RuntimeId = "mock" | "opencode" | "claude-code" | "codex" | "kimi" | "goose" | "custom";

export interface RuntimeInfo {
  id: RuntimeId | string;
  name: string;
  kind: "mock" | "cli" | "acp";
  available: boolean;
  version?: string;
  detail?: string; // not found / path
  bin?: string;
}

export interface RuntimePreferences {
  defaultRuntimeId: string; // default "mock"
  /** optional absolute paths override for known RuntimeId keys only */
  binOverrides: Record<string, string>;
  /** allow real process spawn (desktop only); default false */
  enableSpawn: boolean;
  // NOTE: workspaceAccess / vault-root **不在本切片**。cwd 仅 runs 沙箱。
}
```

**Host（Rust）本切片最小命令：**

| Command | 行为 |
|---------|------|
| `list_runtimes` | 探测 PATH（及 override）上**已知** bin；**始终**包含 `mock` available |
| `get_runtime_prefs` / `set_runtime_prefs` | App config `soit-runtime.json`（照抄 `chat_config.rs` 模式）；**不进** universe.db；`enableSpawn` 默认 **false** |
| `export_card_brief_file` | **P1 后置**（FE 导出足够） |
| `start_runtime_handoff` | 见 2.6；P0 实现 **mock** 全路径；真 CLI 见 P1 |
| `cancel_runtime_handoff` | 取消进行中 run（mock：标 cancelled；CLI：kill） |
| `get_runtime_run` | **P1**；P0 mock 可用 **单次 await** `start_runtime_handoff` 返回终态 |

探测表（**detect-only**，无 adapter 也可 available）：

| id | 探测 |
|----|------|
| mock | always |
| opencode | 解析 `opencode` on PATH 或 override；可选 `--version` |
| claude-code | `claude` |
| codex | `codex` |
| kimi | `kimi` |
| goose | `goose` |
| custom | **本切片不实现 spawn**；list 可省略或 available:false |

Windows 探测：优先 `which` 等效 / `where.exe` **可执行文件查找**，解析第一行绝对路径；**禁止**把用户字符串丢进 `cmd /C` 做通用 shell。失败 → `available:false`，命令仍 Ok。  
**冷启动：** 禁止在 `get_bootstrap_state` / App 首屏 effect 里探测；仅设置「运行时」段 mount 或用户点「刷新」时 `list_runtimes`。

权限：每命令一条 `allow-*` 写入 `permissions/bootstrap.toml` + `capabilities/default.json`（与现网一致）。  
**禁止**引入 `tauri-plugin-shell` 或把任意 argv 暴露给前端。

### 2.6 Handoff 执行（P0 mock + P1 真 CLI）

**Run 状态机：**

```text
idle → staging → running → succeeded | failed | cancelled
```

**全局并发（冻结）：** 最多 **1** 个 `runtimeRun`；已有 staging/running 时 `startRuntimeHandoff` 直接失败并短错误。与 `inquiryInflight` **互斥**。

**Mock runtime（P0 必交 · 验收主路径）：**

- **不** spawn 真进程；不要求 `enableSpawn`
- 可读 brief（FE 或 Host 生成），500–1500ms 可取消等待后返回固定摘要（含 1–2 个 `[[term]]`）
- 写回路径与真 runtime **同一** store/host 序列（便于 P1 替换中段）

**真 CLI（P1 · 不阻塞 mock 验收；计划文件单独可选）：**

- 前置：`enableSpawn === true`（Host 强制）、vault 已绑定、runtime `available`、id ≠ `mock`/`custom`
- 优先尝试 **一个** adapter（`opencode` headless **或** `claude` 非交互）；无 bin 则文档说明 + CI 只跑 mock
- Argv **模板允许列表**（示例意向，实现时写死在 Rust match，不由 FE 拼）：
  - 仅固定 subcommand/flags + `brief.md` 绝对路径；**无**用户自由 shell 字符串
- `binOverrides[id]`：必须是绝对路径、`canonicalize` 后存在、是文件；否则 Err
- `std::process::Command` 直接 exec；Windows 注意无额外 console 闪烁（`CREATE_NO_WINDOW` 类）但不提权
- 超时（建议 10–15 min 可配置常量）→ kill → failed
- stdout/stderr 合计 cap（建议 256 KiB）截断后当结果/错误
- `cancel_runtime_handoff` → kill 子进程；状态 cancelled

**写回（冻结）：**

1. staging：当前卡 `append_turn` user = `（交给本地 Agent：{runtimeName}）`（可附 brief 标题级摘要 ≤200 字，**不要**整份 brief 进 turn user）  
2. running：store `runtimeRun` + turn `think` 进度文案  
3. 成功：`update_turn` aiHtml = `completeResultToHtml(parseAssistantContent(text))`  
4. 失败/取消：aiHtml 短错误句；清理 inflight  
5. **禁止** `spawn_inquiry` / `memorySpawn`；**禁止**改其他卡；**禁止**外部 session id 当作 card id；**禁止**把 run 目录当宇宙源  

**cwd / 文件系统（冻结 · 本切片）：**

- 已绑 vault：创建 `vault/.soit/runs/<runId>/`（canonicalize 后必须仍位于 `vault/.soit/runs/` 前缀下），写 `brief.md`；**cwd = 该 run 目录**
- **禁止** cwd=vault 根；**禁止**本切片实现 `workspaceAccess: "vault-root"`（若真 agent 需读库，P1+ 仅只读路径参数，默认仍不写笔记根）
- 未绑 vault：**仅** mock handoff；真 spawn → Err「先在空间绑定库」
- 不得在笔记根或 `concepts/` 写 handoff 日志

### 2.7 UI：设置 · Runtime + 卡片入口（P0）

**设置 IA：**

- **冻结：** 五段 nav，顺序 **空间 · 模型 · 运行时 · 技能 · 关于**（运行时紧挨模型：都是「执行后端」；技能仍属本库）。  
- 段 id：`runtime`；文案「运行时」；hint「本机 Agent」  
- 内容：默认 runtime 下拉；available 徽章；**enableSpawn** 开关（默认关，危险说明）；bin override 高级区（可选 P1 UI，P0 可只 prefs API）；「刷新检测」；说明「外部 agent 不拥有卡片；spawn 有本机代码执行风险；卡片真相仍在 universe.db」  
- 类型与事件必须同步：
  - `SettingsPanel.tsx`：`SettingsSection` + `NAV`
  - `AppShell.tsx`：`parseSettingsSection` 接受 `"runtime"`
  - 任意 `soit:open-settings` detail  
- **懒加载：** `RuntimeSection` 在段首次选中时 `list_runtimes` + `get_runtime_prefs`，不在 App boot

**卡片：**

- Composer 旁或 overflow：「交给本地 Agent」→ 确认条（runtime 名）→ `startHandoff`  
- 进行中可「停止」→ cancel  
- 与 Inquiry 发送互斥（inflight 任一则锁另一）  
- 若 `InquiryCard` 将超 800 LOC，抽 `CardAgentMenu.tsx` 等薄组件

### 2.8 FE Store 表面（P0）

`WorkspaceState` 增补：

```ts
inquiryInflight: null | { cardId: string; turnId: string; gen: string; controller: AbortController }
runtimePrefs: RuntimePreferences | null
runtimes: RuntimeInfo[]
runtimeRun: null | {
  runId: string
  cardId: string
  turnId: string
  runtimeId: string
  status: "staging" | "running" | "succeeded" | "failed" | "cancelled"
  detail?: string
}
refreshRuntimes: () => Promise<void>
loadRuntimePrefs: () => Promise<void>
setRuntimePrefs: (p: Partial<RuntimePreferences>) => Promise<void>
startRuntimeHandoff: (opts?: { cardId?: string; runtimeId?: string }) => Promise<void>
cancelRuntimeHandoff: () => Promise<void>
exportCardBrief: (cardId?: string) => Promise<CardBrief>
importAssistantToFocus: (raw: string, opts?: { asResidue?: boolean }) => Promise<void>
cancelInflight: () => void
```

Demo 模式：`list_runtimes` 无 Tauri 时 FE fallback（仅 mock available）。

### 2.9 测试（P0）

| 测试 | 断言 |
|------|------|
| `cardBrief.test.ts` | 仅本卡 messages；deepen 无父 turns；md 往返关键字段 |
| `runCompletion` / chatActions | cancel 使旧 complete 不写；inflight 锁；空回复文案 |
| `runtime` mock handoff | 新 turn 写回；不增节点；失败路径 |
| Host Rust | `list_runtimes` 含 mock；prefs roundtrip；`enableSpawn=false` 拒真 spawn；runs 路径 `..` 拒绝 |
| 回归 | 现有 `workspaceStore.test.ts` deepen/regenerate 不增节点 |

### 2.10 AGENTS.md 同步（P0）

更新：

- root / `src/lib/AGENTS.md` / `src/state/AGENTS.md` / `src/components/shell/AGENTS.md` / `src/components/card/AGENTS.md` / `src-tauri/AGENTS.md`  
- 写明双轨、brief、runtime commands、禁止外部 session 当源  

---

## 3. 文件变更清单

| 文件 | 变更 | 节号 |
|------|------|------|
| `知识库/docs/共识.md` | 双轨措辞 §6–8 / 决策表 | 2.0 |
| `知识库/docs/对象模型.md` | 可选：runs 目录一句 | 2.0 |
| `src/lib/cardBrief.ts` | **新建** brief 构建/md | 2.3 |
| `src/lib/cardBrief.test.ts` | **新建** | 2.9 |
| `src/lib/chat/systemPrompt.ts` | **新建** | 2.2 |
| `src/lib/chat/openaiCompat.ts` | signal + systemPrompt | 2.1–2.2 |
| `src/lib/chat/mockChat.ts` | signal | 2.1 |
| `src/lib/chat/port.ts` | complete 入参可选 signal | 2.1 |
| `src/lib/chat/index.ts` | 导出 | 2.1 |
| `src/lib/runtime/types.ts` | **新建** | 2.5 |
| `src/lib/runtime/prefs.ts` | **新建** FE prefs 镜像 | 2.5 |
| `src/state/runCompletion.ts` | **新建** 共享管线 | 2.1 |
| `src/state/chatActions.ts` | 改用管线 + cancel | 2.1 |
| `src/state/runtimeActions.ts` | **新建** handoff | 2.6–2.8 |
| `src/state/workspaceStore.ts` | 表面扩展 | 2.8 |
| `src/state/workspaceStore.test.ts` | 增补 | 2.9 |
| `src/lib/host.ts` | runtime commands + types | 2.5–2.6 |
| `src/types.ts` | 必要时 re-export | 2.5 |
| `src/components/card/Composer.tsx` | 停止 / inflight disabled / 可选 handoff 入口 | 2.1, 2.7 |
| `src/components/card/InquiryCard.tsx` | 导出导入 / handoff 接线（注意 ≤800 LOC，可抽小菜单组件） | 2.4, 2.7 |
| `src/components/card/card.css` | 少量样式 | 2.7 |
| `src/components/card/AGENTS.md` | 导出/handoff/停止手势 | 2.10 |
| `src/components/shell/AppShell.tsx` | `parseSettingsSection` + 五段 | 2.7 |
| `src/components/shell/SettingsPanel.tsx` | section `runtime` + NAV 顺序 | 2.7 |
| `src/components/shell/settings/RuntimeSection.tsx` | **新建** 懒加载探测 | 2.7 |
| `src/components/shell/settings/settings.css` | 样式 | 2.7 |
| `src/components/shell/AGENTS.md` | 五段 + runtime 事件 | 2.10 |
| `src-tauri/src/runtime/` | **新建** mod：detect prefs handoff mock | 2.5–2.6 |
| `src-tauri/src/lib.rs` | register commands | 2.5 |
| `src-tauri/permissions/bootstrap.toml` | allow-* | 2.5 |
| `src-tauri/capabilities/default.json` | permissions | 2.5 |
| `src-tauri/AGENTS.md` | 命令表 | 2.10 |
| `src/lib/AGENTS.md` / `src/state/AGENTS.md` | 双轨 | 2.10 |
| `docs/superpowers/plans/2026-08-20-a*.md` | 执行计划 | §5 |

---

## 4. 架构图

```text
                    ┌──────────────────────────────┐
                    │  InquiryCard / Composer        │
                    │  send · stop · export · handoff│
                    └────────────┬─────────────────┘
                                 │
                         workspaceStore
                    ┌────────────┴────────────┐
                    ▼                         ▼
             runCompletion              runtimeActions
             (Inquiry 主轨)              (Runtime 副轨)
                    │                         │
          ChatPort.complete            Host start_runtime_handoff
          mock | openai-compat         mock | (P1 CLI)
                    │                         │
                    └────────────┬────────────┘
                                 ▼
                        append_turn / update_turn
                        universe.db  (卡片真相)
                                 │
                    precipitate / residue → vault md
                                 │
                           Obsidian 阅读
```

```text
Handoff:
  buildCardBrief(card) → brief.md under .soit/runs/<id>/
       → runtime mock/CLI
       → assistant HTML → same card turn
  External session dirs NEVER become card ids.
```

---

## 5. 实施顺序

### Wave 结构（按文件冲突）

```text
Wave 1（可并行）:
  A1 共识文档 + AGENTS 预告          （知识库 + AGENTS.md）
  A2 cardBrief + 单测 + systemPrompt （src/lib/* 新建为主）
  A3 Rust runtime detect/prefs/mock  （src-tauri only）

Wave 2（依赖 W1，可并行两路）:
  A4 runCompletion + chatActions cancel/inflight （state + chat；systemPrompt 来自 A2）
  A5 host.ts + FE runtime types/prefs 接线       （host + `src/lib/runtime/*`；**不**改 workspaceStore handoff）

Wave 3（依赖 W2）:
  A6 runtimeActions handoff 写回 + store 表面 + 测试

Wave 4（依赖 W3）:
  A7 UI：Composer/InquiryCard + AppShell/Settings 五段 + RuntimeSection

Wave 5（依赖 W4）:
  A8 全量 npm test / cargo test / build 冒烟 + 手测清单（**mock 验收闭环**）

Optional / P1（不阻塞 A8）:
  A9 真 CLI adapter + kill/timeout 单测（无 bin 则 skip）
```

| 阶段 | 计划文件 | 依赖 | 估时 |
|------|----------|------|------|
| W1 | `a1-consensus-agents.md` | — | 0.25d |
| W1 | `a2-card-brief.md` | — | 0.5d |
| W1 | `a3-host-runtime.md` | — | 1.0d（含 prefs + mock handoff cmd + 路径校验；真 CLI 不进） |
| W2 | `a4-inquiry-pipeline.md` | A2（systemPrompt；与 cardBrief 无硬依赖） | 0.75d |
| W2 | `a5-host-fe-bridge.md` | A3 | 0.5d |
| W3 | `a6-handoff-store.md` | A4+A5 | 0.75d |
| W4 | `a7-ui-runtime.md` | A6 | 0.75d |
| W5 | `a8-verify.md` | A7 | 0.5d |
| P1 | `a9-cli-adapter.md`（可选） | A8 | 1.0d |

**同波并行条件：** A1/A2/A3 文件集不相交；A4=`src/state/*`+`src/lib/chat/*`，A5=`host.ts`+`src/lib/runtime/*`+types，**禁止** A5 写 `runtimeActions`/`workspaceStore` handoff 表面（留给 A6）。A7 独写 AppShell/Settings/Composer/InquiryCard。

---

## 6. 验收标准

- [ ] `知识库/docs/共识.md` 含双轨定义；禁止外部 session 当卡片源；v1 措辞不再是裸「单 Agent + 工具」独占  
- [ ] 发送与重生共用 `runCompletion`；单测：regenerate **不**增 nodes（回归 `workspaceStore.test.ts`）  
- [ ] 生成中可停止；abort/迟到 complete **不**覆盖 turn；空模型回复显示明确文案（非空白）  
- [ ] `inquiryInflight` 与 `runtimeRun` 互斥；进行中 Composer 不可二次发送  
- [ ] `buildCardBrief`：仅本卡 messages；deepen **无**父 turns；单测夹具覆盖  
- [ ] 导出 Markdown / 导入 assistant：demo 可跑；universe 路径 `append_turn`+`update_turn`；导入 HTML 经 escape  
- [ ] `list_runtimes` 含 mock；`soit-runtime.json` 读写 **不**进 universe.db；`enableSpawn` 默认 false  
- [ ] Mock handoff：当前卡 +1 turn 并写回 AI；**nodes 数不变**；不调用 `spawn_inquiry`  
- [ ] 未绑 vault：mock handoff 可用；`enableSpawn` 真 spawn 拒绝  
- [ ] `enableSpawn=false` 时 Host 拒绝非 mock 真 spawn（即使 FE 绕过）  
- [ ] 无 `tauri-plugin-shell`；handoff cwd/prefix 校验单测（拒绝 `..` 逃逸）  
- [ ] 设置五段含「运行时」；`soit:open-settings` `{ section: "runtime" }` 可打开；卡片有导出 + handoff 入口  
- [ ] 冷启动 / `get_bootstrap_state` **无** runtime 探测、**无**模型网络  
- [ ] 无完整 transcript 写入 Obsidian 的新路径；runs 仅在 `vault/.soit/runs/`  
- [ ] 触碰的生产 TS/RS 文件仍 ≤800 LOC  
- [ ] `npm test` / `npm run build` / `cd src-tauri && cargo test` 通过  

---

## 7. 不在范围

- **无界** ReAct / 自研 coding **Agent Core** / 任意 shell·写树·子 Agent 舰队工具环  
  - **允许（v1.2）**：主轨 **有界** Host 工具（固定目录 `vault_search` / `fetch_url` / `web_search`、max rounds、过程时间线）— 见 `2026-08-21-inquiry-tools-search-spec.md`  
- 子 Agent 舰队、多卡并行 mute 编排 UI  
- Soit 作为 Claude/Cursor 的 MCP 主入口（反向可后置）  
- ACP 全量多 vendor 生产级适配矩阵（本切片 mock + 探测；真 CLI ≤1 且 P1）  
- `workspaceAccess: "vault-root"` / 默认给外部 agent 写笔记根  
- `custom` runtime 自由 argv；`tauri-plugin-shell`  
- 模型请求强制改走 Rust 代理（工具执行可走 Host；completion 仍可 FE fetch）  
- 完整 Markdown 渲染器 / 代码块执行  
- 一卡一笔记、聊天全文镜像进 vault  
- 合并探究、第三种分叉节点  
- 文件夹选择 dialog 插件（沿用路径文本）  
- 改动左栏 orbit 导航大改（并行 WIP 勿抢）  
- App 启动时自动 `list_runtimes`  

---

## 8. 风险

| 风险 | 缓解 |
|------|------|
| 真 coding agent = 本机代码执行 | enableSpawn 默认 false + Host 强制；argv 允许列表；无 shell 插件；cwd 沙箱 + canonicalize 前缀；超时/输出 cap；并发 1 |
| brief / 父卡上下文泄漏 | handoff 与 chat 同样遵守 deepen 无父 transcript；单测夹具；cardId 绑定 |
| Windows PATH / GUI 环境 | available:false + 绝对路径 override；mock 保底验收 |
| 与未提交 shell WIP 冲突 | **避免**改 FocusOrbit/PathLineNav；Settings 只扩 section + AppShell 解析 |
| chatActions / InquiryCard 超 800 LOC | 拆 `runCompletion` / `runtimeActions`；UI 可抽 handoff 菜单文件 |
| 用户以为外部 chat 即卡片 | 设置文案 + import/handoff 固定 user 前缀 + 共识补丁 |
| 空回复 / 竞态覆盖 | runCompletion 空文本文案；`inquiryInflight.gen` 权威 |

---

## 9. 版本变更

| 版本 | 说明 |
|------|------|
| v1.0 | 首版：双轨架构、brief、mock handoff、Inquiry 管线/取消、设置运行时段 |
| v1.1 | Oracle REVISE：冻结 spawn 安全（无 shell 插件/argv 允许列表/enableSpawn Host 强制/并发1/沙箱 cwd）；brief handoff 信任边界；`inquiryInflight`；空回复；Settings 五段顺序 + AppShell；A8=verify / A9=可选 CLI；验收与非目标补全 |
