# Inquiry 工具调用 + 搜索 — Spec v1.1

> 日期: 2026-08-21  
> 依据: `知识库/docs/共识.md` §6.1 + Q18；`非目标.md`；`2026-08-20-agent-dual-track-spec.md` **v1.2** §7（禁无界 ReAct Core；**明示允许**主轨有界 Host 工具）；会话「过程时间线」  
> 基线分支: `main`  
> 前置依赖: ChatPort + abort；`runCompletion`；Skills 文本；vault read/materials；Turn think UI；Settings 壳  
> Oracle: v1.0 → **REVISE** → v1.1（wire messages、单次耐久写、SSRF、default web off）

---

## 摘要

主轨 Inquiry：**有界 Host 工具环**（默认 ≤3 轮）+ 固定工具目录 `vault_search` / `fetch_url` / `web_search`。过程与思考合并为回合 **过程时间线**（单折叠入口）。网页搜索默认 **off**；可选 DDG（无 Key）或 Tavily。模型仍 FE fetch；工具执行走 Rust Host。非完整 Agent Core。

---

## 0. 前置依赖

| 已有 | 路径 |
|------|------|
| `runCompletion` | `src/state/runCompletion.ts` |
| OpenAI-compat | `openaiCompat.ts` — 今日无 tools |
| `ChatMessage` plain | `port.ts` — 仅 system/user/assistant + content string |
| Turn.think UI | `TurnItem` / `.ic-think-*` |
| vault 读 | `read_vault_text` / materials |
| ALTER 列先例 | `turns.starred`；**SCHEMA_VERSION 仍为 1** |
| Settings sections | space/appearance/model/runtime/skills/about |

---

## 1. 现状

| 缺口 | 证据 |
|------|------|
| 无 tool-loop | 一次 `port.complete` |
| 无 wire tool messages | `ChatMessage` 无 tool_calls / role:tool |
| 无 Host HTTP 工具 | Cargo 无直接 reqwest 业务用 |
| 过程仅 think 字符串 | `Turn.think` |
| 双轨 §7 旧文禁「多步 tool-loop」 | v1.2 改为禁无界 Core、允有界 Host 工具 |

---

## 2. 需要做的工作

### 2.0 文档 W0（P0，先于代码）

1. **`知识库/docs/共识.md` §6.1**：主轨可有 **有限 Host 工具**（库内检索 / 读 URL / 可选网页搜索）；步数上限；过程进回合过程区；正式回答仅 `ai_html`。  
2. **决策表 Q18**：主轨有限 Host 工具 = 有界目录 + 有界轮次，非 Agent Core。  
3. **`agent-dual-track-spec.md` → v1.2 §7**：删除/改写「自研 ReAct / 多步 tool-loop Agent Core」为：
   - **禁止** 无界 ReAct、自研 coding Agent Core、任意 shell/写树工具舰队  
   - **允许** 主轨 **有界** Host 工具轮（固定目录、max rounds、见本 spec）

### 2.1 Process 数据模型（P0）

```ts
export type ProcessStepStatus = "running" | "ok" | "error" | "cancelled";
export type ProcessStepKind =
  | "think"
  | "vault_search"
  | "web_search"
  | "fetch_url";

export interface ProcessStep {
  id: string;
  kind: ProcessStepKind;
  title: string;
  summary?: string;
  status: ProcessStepStatus;
  detail?: string;
  startedAt?: string;
  endedAt?: string;
}

// Turn
process?: ProcessStep[];
```

- DB: `ALTER TABLE turns ADD COLUMN process_json TEXT NOT NULL DEFAULT '[]'` **若缺列**；**不 bump `SCHEMA_VERSION`**（保持 1）。  
- IPC: `process?: ProcessStep[]`；DB 存 JSON 字符串；snapshot `COALESCE`。  
- **无 `runtime` kind**（handoff 不改）。  
- 兼容：仅 think → UI 投影单步 think。

### 2.2 工具目录（P0 全三件；web 默认关）

| name | 行为 | 上限 |
|------|------|------|
| `vault_search` | 扫 `materials/` `concepts/` `inquiry/` + 库根一层 `*.md`；跳过 `.soit` `.git` `node_modules`；子串不敏感 | query≤200；limit 6..12；文件≤64KiB；snippet≤400；总≤24KiB |
| `fetch_url` | GET http(s)；粗 HTML→text | 超时 12s；body≤1.5MB；text≤12k 字 |
| `web_search` | prefs 后端 | query≤200；≤8 hits；snippet≤280 |

**SSRF（fetch_url，P0 冻结）：**

- 仅 http/https  
- 默认拒绝：loopback、link-local、metadata（169.254.169.254）、私网 `10/8` `172.16/12` `192.168/16`、ULA  
- `allowLoopbackFetch=true` **仅**放行 127.0.0.1/::1，不放行整段 LAN  
- 禁用或逐跳重校验 redirect  
- 非 http(s) / 解析失败 → error

**JSON Schema：** 每个 tool `type:object` + `properties` + `required` + `additionalProperties:false`。

### 2.3 Tools prefs（P0）

`soit-tools.json`（app config，非 universe.db）：

```ts
{
  version: 1,
  toolsEnabled: true,              // default
  maxToolRounds: 3,                // clamp 1..5
  webSearchBackend: "off",         // default OFF（Oracle）
  tavilyApiKey: "",
  allowLoopbackFetch: false
}
// WebSearchBackend = "off" | "ddg" | "tavily"
```

- Host `get_tools_prefs` / `set_tools_prefs`  
- FE LS 镜像 `soit-tools-prefs`  
- Settings section **`tools`**；NAV 顺序：  
  **空间 · 外观 · 模型 · 工具 · 运行时 · 技能 · 关于**  
- `AppShell.parseSettingsSection` 识别 `tools`  
- bootstrap **不**出网

`web_search`：`off` → 可读 error；`ddg` → DDG HTML；`tavily` → API（无 key 提示设置）。

### 2.4 Host 执行（P0）

`src-tauri/src/tools/`：`prefs` / `vault_search` / `fetch_url` / `web_search` / `mod`  

- Command: `invoke_inquiry_tool { name, argsJson } -> ToolInvokeResult`  
- `ToolInvokeResult { ok, title, summary, content, error? }`  
- Cargo **直接**依赖 `reqwest`（`default-tls`/`native-tls` + `json`）；**async 或 spawn_blocking**，禁止在 async runtime 上同步阻塞乱调  
- permissions + capabilities  
- Browser mock：三工具可 stub；DDG 不依赖真 CORS；桌面为权威

### 2.5 ChatWireMessage + Port（P0）

**持久卡历史**仍用 plain `ChatMessage[]`（user/assistant 文本）。  
**工具环内**使用 ephemeral **`ChatWireMessage[]`**，**不**写入 turns、**不**在下次 send 回放：

```ts
type ChatWireMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

// ChatCompleteInput
messages?: ChatMessage[];       // plain path / explain
wireMessages?: ChatWireMessage[]; // tool loop path (preferred when set)
tools?: ChatToolDef[];
toolChoice?: "auto" | "none";

// ChatCompleteResult
toolCalls?: ChatToolCall[]; // id, name, arguments
// empty text placeholder ONLY when !toolCalls?.length (final)
```

`OpenAICompatChat`：序列化 wire 不丢 tool_calls；解析 `message.tool_calls`；`content` 可 null。  
`MockChat`：支持一次假 tool call + 次轮终答（单测）。  
**explain：永不进 tool loop、不传 tools。**

System 工具策略：**唯一**注入点 `buildInquirySystemPrompt(scope, { toolsEnabled })`。

### 2.6 runToolLoop + 持久化策略（P0）

```
wire = [system via port, ...plain history as user/assistant]
process = []
for round in 0..maxToolRounds:
  result = complete({ wireMessages: wire, tools, toolChoice: auto, signal })
  if think: process += think step
  if !toolCalls: final = result; break
  wire += assistant(tool_calls)
  for call in toolCalls (≤3/round):
    process += running; patchTurnAi FE-only
    inv = invoke_inquiry_tool
    process update ok|error
    wire += tool result
else:
  final = complete({ wire, toolChoice: none, tools: undefined })

// 仅终局：
writeAi(aiHtml, thinkJoined, process) → 一次 update_turn
```

**冻结：**

- **环中**只 `patchTurnAi({ process, think?: busy })`，**禁止**每步 `update_turn` 全量 snapshot  
- **成功/可见失败终局** 一次 Host 写：`aiHtml + think + process`  
- **abort**：与现网一致 — 不写成功答案；本地 process 可丢  
- `（模型返回为空）` **仅**终局且无 toolCalls  
- 坏 JSON args / 未知工具名 → error step + content 回模型，不整轮 throw  
- 轮次耗尽 → 最后 `toolChoice: none`

### 2.7 过程 UI（P0）

- 单入口（升级 think wrap → process wrap）  
- 有 process 优先；仅 think 旧行为  
- 默认折叠；本地 open state；`turn.id` 重置  
- busy 文案兼容 `*中…` / `生成中…`  
- 步骤二级 detail；error 左边线提示  

### 2.8 设置 UI（P0）

`ToolsSection`：总开关、max rounds、backend、tavily key、短说明。

---

## 3. 文件变更清单

| 文件 | 变更 |
|------|------|
| `知识库/docs/共识.md` | §6.1 + Q18 |
| `docs/.../agent-dual-track-spec.md` | v1.2 §7 |
| `src/types.ts` | ProcessStep, Turn.process |
| `universe/schema|dto|mutations|snapshot` + `lib.rs` update_turn | process_json |
| `src-tauri/src/tools/*` + Cargo.toml | 执行 + prefs |
| permissions + capabilities | 新 commands |
| `src/lib/host.ts` | bridge + mock |
| `src/lib/tools/*` | defs, prefs, labels, invoke |
| `src/lib/chat/port|openaiCompat|mock|systemPrompt|index` | wire + tools |
| `src/state/runToolLoop.ts` + `runCompletion` + `turnHelpers` | 环 |
| `TurnItem` + card.css | 过程 UI |
| `SettingsPanel` + `AppShell` + `ToolsSection` | 设置 |
| tests | wire / loop / prefs / label / SSRF rust |

---

## 4. 架构

```
plain history (turns) ──► wire (ephemeral)
                              │
                         complete(+tools)
                              │
              ┌──────── tool_calls? ────────┐
              no                          yes
              ▼                            ▼
         final text              Host invoke_inquiry_tool
              │                   patch process (FE)
              │                   wire += tool
              ▼                            │
         update_turn ◄──────────── loop ───┘
         (aiHtml, think, process once)
```

---

## 5. 实施顺序

| Wave | Plan | 依赖 |
|------|------|------|
| W0 | 文档共识 + dual-track v1.2 | — |
| W1 | T1 process model (DB/DTO/types/host) | W0 |
| W1 | T2 host tools+prefs（不改 turns 表） | W0；`lib.rs` command 登记与 T1 串行合并 |
| W2 | T3 wire + toolLoop + runCompletion | T1+T2 |
| W3 | T4 UI + Settings | T1 types + T2 prefs API |
| W4 | T5 tests + AGENTS + verify | T3+T4 |

工作量：**约 3.5–5 fixer-day**（全量）；web 可测 mock 不挡。

计划文件：

1. `2026-08-21-t1-process-model.md`  
2. `2026-08-21-t2-host-tools.md`  
3. `2026-08-21-t3-tool-loop.md`  
4. `2026-08-21-t4-process-ui-settings.md`  
5. `2026-08-21-t5-tests-verify.md`  

---

## 6. 验收标准

- [ ] toolsEnabled + 支持 tools 的模型：需检索问题可出现 process 步 + 终局 aiHtml  
- [ ] vault_search 不读 `.soit`；不逃逸 vault  
- [ ] fetch_url SSRF 单测：私网/metadata 拒绝  
- [ ] web_search default off → 明确 error；ddg/tavily 可配置  
- [ ] 过程默认折叠；单入口；正文无 raw tool JSON  
- [ ] explain 无工具  
- [ ] abort 无成功终答  
- [ ] max rounds 后仍有终答  
- [ ] wire 历史不落库  
- [ ] 环中无 N 次 update_turn snapshot；终局一次  
- [ ] SCHEMA_VERSION 仍为 1  
- [ ] 冷启动无搜索网  
- [ ] `npm test` / `npm run build` / `cargo test` 通过  
- [ ] Settings → 工具 生效于下次发送  

---

## 7. 不在范围

- 无界 ReAct / coding Agent Core / shell / 写库 / 改卡树工具  
- 浏览器自动化  
- tool wire 历史持久化进 turns  
- 环中 Host snapshot 风暴  
- handoff process 迁移  
- 模型改走 Rust 代理  
- SearXNG UI（枚举可扩）  
- LAN fetch 默认开放  

---

## 8. 风险

| 风险 | 缓解 |
|------|------|
| OpenAI message shape | ChatWireMessage + 单测 fixture |
| DDG 脆 | 默认 off；错误可读 |
| SSRF | 解析 + deny list + redirect |
| snapshot 竞态 | 仅终局 Host 写 |
| 模型不支持 tools | 空 toolCalls → 单轮文本 |

---

## 9. 版本变更

| Ver | 说明 |
|-----|------|
| v1.0 | 初稿 |
| v1.1 | Oracle REVISE：wire、单次耐久写、SSRF、web default off、无 runtime kind、dual-track 对齐、SCHEMA_VERSION=1 |

---

## 10. 热文件串行

`runCompletion.ts` `port.ts` `openaiCompat.ts` `host.ts` `SettingsPanel` `AppShell` `schema/mutations/dto/snapshot` `TurnItem` `lib.rs` — 同文件不并行 fixer。
