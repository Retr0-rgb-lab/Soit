# Host Hardening & Durability — Spec v1.0

> 日期: 2026-08-20  
> 依据: `知识库/docs/共识.md`、`对象模型.md`、`非目标.md`；philosophy-alignment v1.1；五路审计（universe / obsidian / host-IPC / FE store / 产品漂移）  
> 状态: **ACTIVE** — 实现以本 Spec 为验收真源  
> 前置: Wave A–F 脚手架已合入；本 Spec **补核**，停止「半核 Host」叙事

---

## 1. 摘要

当前是 **会话 UI + 部分 Host**：卡/边可落 `universe.db`，主路径对话与未读仍 FE 内存；spawn 全量快照会抹掉未落库对话；概念沉淀会抹用户 frontmatter；冷启动不恢复 vault。

本 Spec 北极星：

> **在绑定 vault 的路径上，用户关掉 App 再打开：树、边、对话、探究状态都还在；突变失败时系统不装成功。**

未满足前，对外叙事保持：UI 骨架 + partial Host，**不得**宣称理念已实现。

---

## 2. 审计冻结事实（不可再议）

| ID | 事实 |
|----|------|
| F1 | 用户发送 / 重生 / 删轮 / 折叠 **不写** `universe.db` |
| F2 | Universe 路径 `spawn` → `mergeHostSnapshot` **整表替换** turns → 丢内存对话 |
| F3 | `unread` 只在 FE 清除；DB 子卡 `unread=1` 重启复现 |
| F4 | 冷启动无 `last_vault`；默认 unbound/demo |
| F5 | `obsidian::format_frontmatter` **丢弃**用户 YAML 键 |
| F6 | `schema_version` 只插入不校验；edges/parent 无 FK |
| F7 | Deepen scope 缺父 `title/question/stuck/next` |
| F8 | `csp: null`；vault 路径无 canonicalize |
| F9 | `workspaceStore.ts` / `universe.rs` 贴 800 LOC 硬顶 |

---

## 3. 不变量（本波必须可指证）

### 3.1 Durability (D)

| ID | 不变量 | 验收 |
|----|--------|------|
| D1 | Universe 路径下 turn 突变经 Host | 无 `append_turn` 的 FE-only 成功路径 |
| D2 | 杀进程再开同 vault → 用户对话仍在 | 集成/手工：root→send→reopen |
| D3 | spawn 不丢他卡已落库 turns | spawn 前后 parent turns 一致 |
| D4 | unread 清除写回 DB | focus/markRead → reopen 仍已读 |
| D5 | 失败不装成功 | host 错 → 无鬼卡、无假「已发送」 |

### 3.2 Host (H)

| ID | 不变量 | 验收 |
|----|--------|------|
| H1 | Bootstrap **永不** open DB / 网络 | 保持现测 |
| H2 | Host 生成持久化实体 id（card/edge/turn） | append_turn 返回 host id |
| H3 | `open_universe` 仅绝对路径 + canonicalize | 相对路径 Err |
| H4 | last_vault 在 **app config**（非 db）；恢复显式 open | 二次启动可一键/自动恢复 |
| H5 | Chat 密钥永不进 `universe.db` | 保持 |

### 3.3 Inquiry (I)

| ID | 不变量 | 验收 |
|----|--------|------|
| I1 | Snapshot 含 status/question/**stuck**/**next**（`next_step`） | DTO + FE 类型 |
| I2 | `update_card` 可写 title/status/question/stuck/next/unread | 重启仍在 |
| I3 | Deepen scope = 父 title/status/question/stuck/next + span + why + **子** recentTurns | 单测；**无**父 transcript |
| I4 | 活线 ≠ inquiry status | 不混用 |

### 3.4 Obsidian (O)

| ID | 不变量 | 验收 |
|----|--------|------|
| O1 | 沉淀 **保留**未知 frontmatter 键；只 upsert `soit_card_ids` / `soit_managed` | 单测 tags 存活 |
| O2 | `card_id` / title 消毒：无 YAML/marker 注入 | 单测 |
| O3 | 概念写 **原子**（temp + rename） | 实现可指证 |
| O4 | 残渣日期 = **本地**日历日 | 非 UTC 默认 |
| O5 | 仍禁止 per-card transcript 镜像 | 路径检查 |

### 3.5 Process (P)

| ID | 不变量 | 验收 |
|----|--------|------|
| P1 | 生产源文件 **≤800 LOC**（硬顶） | 本波触及文件超标必须同 PR 净拆 |
| P2 | 拆缝不拆戏；对外 API re-export 兼容 | `Universe::` / store 方法名稳定 |
| P3 | 新命令三角：handler + permission toml + capabilities + `host.ts` | 清单齐全 |

---

## 4. 权威矩阵

| 数据 | 权威 | FE 角色 |
|------|------|--------|
| nodes / edges | Host `universe.db` | 缓存；universe 路径禁止 memory-only 成功写 |
| turns（universe） | Host | 乐观 UI 允许；ack/snapshot reconcile |
| turns（demo） | FE 内存 | 可 memorySpawn / 本地 turn |
| unread / card status 字段 | Host | 写穿 |
| liveIds / recent / map mode / highlight | FE session | 不落库 |
| last_vault | app config | bootstrap 只读路径，**不** open DB |
| BYOK | app config (+ dev localStorage) | 不进 db |
| concepts / residue | vault md | 工具写出 |
| skills enable | vault `.soit` | Host |

---

## 5. 命令面契约（Host）

命名 camelCase JSON。失败：`Result<_, String>` 或既有 `{ ok, error }`。

### 5.1 Turn

#### `append_turn`

```text
args: { cardId: string, title?: string, user: string, quote?: string }
→ { turn: TurnDto, snapshot?: WorkspaceSnapshotDto }
```

- Host 生成 `t_*` id；`sort_order` = max+1  
- `user` 必填非空；可把 quote 编进 user 文本（与 FE 现逻辑一致：`> quote\n\ntext`）  
- `ai_html` / `think` 初值空 / `生成中…` 由 FE 或 Host 约定：**Host 存空 think，FE 乐观显示生成中**  
- 返回至少含新 turn；**推荐**返回全量 snapshot 以简化 FE（v1 可全量）

#### `update_turn`

```text
args: {
  cardId: string,
  turnId: string,
  aiHtml?: string,
  think?: string,
  thinkOpen?: boolean,
  collapsed?: boolean,
  title?: string,
  user?: string
}
→ { ok: true, snapshot?: WorkspaceSnapshotDto }
```

- 仅更新提供的字段；不存在 → Err  
- **禁止**创建 card/edge  
- `aiHtml` 若写入：信任调用方已 escape（FE `completeResultToHtml`）；Host 不做 Markdown 渲染

#### `delete_turn`

```text
args: { cardId: string, turnId: string }
→ { ok: true, snapshot?: WorkspaceSnapshotDto }
```

### 5.2 Card

#### `update_card`

```text
args: {
  cardId: string,
  title?: string,
  status?: "active"|"paused"|"done"|"stuck",
  question?: string | null,
  stuck?: string | null,
  next?: string | null,   // maps to next_step column
  unread?: boolean
}
→ { ok: true, snapshot?: WorkspaceSnapshotDto }
```

#### `mark_cards_read`（可选薄封装）

```text
args: { cardIds: string[] }
→ snapshot
```

等价于对每个 id `unread=false`；FE `markThreadRead` / `focusNode` 可批量调用或循环 `update_card`。

### 5.3 Session / vault

#### `get_last_vault` / `set_last_vault`

- 存 app config：`soit-session.json` 字段 `lastVault: string | null`  
- **或** 并入现有 config 模块，但 **禁止** 写入 `universe.db`  
- `set_last_vault` 在成功 `open_universe` 后由 FE/Host 调用  
- `close_universe` 不强制清 last（用户可「记住库」）

#### `open_universe` 收紧

- path 必须是绝对路径（Windows: 盘符或 `\\`；Unix: `/`）  
- `canonicalize`（Windows 可用 dunce 去 `\\?\`）后存储  
- 相对路径 → `ok: false` + error  
- 成功 → 可内部 `set_last_vault`（推荐 Host 侧自动记，减少 FE 漏调）

### 5.4 Snapshot 扩展

`InquiryNodeDto` / FE `InquiryNode` 增加：

```ts
stuck?: string | null;
next?: string | null;  // next_step
```

`snapshot.focus_id`：

- 优先 `meta.last_focus_id` 若卡仍存在  
- 否则 oldest root（保持现状兜底）  
- `spawn_inquiry` / `append_turn` 后可更新 `last_focus_id` 到相关卡（spawn→child；append→cardId）

### 5.5 schema_version

- 读到 version **大于** `SCHEMA_VERSION` → open Err（提示升级 App）  
- version **小于** → 跑 migrate 路径至当前；成功后写 version  
- 本波至少：gate + 文档；FK 增强：

```sql
-- 新库 DDL 目标（migrate 尽力）：
-- cards.parent_id REFERENCES cards(id)  -- SQLite 加 FK 受限，新库 CREATE 时带上
-- edges.from_card_id / to_card_id REFERENCES cards(id)
```

旧库：不强制 rewrite 全表；新 open 的空库用强 DDL。

---

## 6. 前端 store 契约

### 6.1 Universe 路径

当 `source === "universe"`（**不**依赖 vaultPath 偶然非空）：

| 动作 | 行为 |
|------|------|
| `appendUserMessage` | Host `append_turn` → complete → `update_turn` aiHtml；任一步失败可见错误，不假装成功 |
| `regenerateTurn` | complete → `update_turn`；不增节点 |
| `deleteTurn` / `toggleTurnCollapsed` | Host `update_turn` / `delete_turn` |
| `spawnInquiry` | 仅 Host；失败 `""` + UI 错误；**禁止** memory fallback |
| `focusNode` 清 unread | `update_card` unread=false（fire-and-forget 可，失败 log） |
| `markThreadRead` | 批量 unread=false |
| `memorySpawnInquiry` | **禁止** |

当 `source === "demo"`（及浏览器 mock）：保持内存路径。

当 `source === "empty"`：仅 `createRootInquiry` 等已有 Host；无 memory 树。

### 6.2 mergeHostSnapshot

- 全量替换 **允许**，前提：universe 路径 turns **已全部在 Host**  
- 在 D1 满足前：spawn 前若有 dirty FE turns，必须先 flush 或拒绝 spawn并提示  
- 本波实现顺序：**先 write-through，再依赖全量 snapshot**

### 6.3 Bootstrap 竞态

- `App` load 与 `openUniverse` 共用 `bootGen` / `loadEpoch`  
- 过期的 `loadSnapshot` **不得**覆盖更新 epoch

### 6.4 Deepen scope v2

```ts
{
  parent: {
    title, status, question, stuck, next
  },
  span, why,
  recentTurns // child only
}
```

单测锁死：scope JSON **不含**父卡 turns 全文。

---

## 7. Obsidian 契约补丁

1. **FM merge**：解析原 frontmatter 文本；更新/插入 `soit_card_ids` 列表与 `soit_managed: true`；**保留**其他行/键。  
2. **yaml_escape** 所有写入 FM 的 id。  
3. **strip** title/question/hint 中的 `AUTO_START`/`AUTO_END` 字面量。  
4. **write**：`*.md.tmp` + rename 覆盖。  
5. **today_ymd / now_hms**：本地时区（Windows：局部 offset 或 `chrono`/等效；避免纯 UTC day）。  
6. **residue text** 建议 cap 8_000 chars（超长 Err）。

---

## 8. 安全（本波最小）

| 项 | 要求 |
|----|------|
| CSP | `tauri.conf.json` 设非 null：至少 `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'`（WebView 需要可调）；**connect-src** 需允许用户 BYOK（可 `'self' https: http://localhost:* http://127.0.0.1:*`） |
| 模型 HTML | 保持 FE escape；demo 静态 HTML 例外 |
| skills inject | 总字节 soft cap 建议 32_768；超出截断 + log |
| apiKey localStorage | Tauri 路径：`setChatConfig` 成功后 **可**不再把完整 key 写入 LS（或只写 `hasKey` 标记）；不得阻塞本波 D1 |

---

## 9. 文件体量与拆分清单

**硬顶 800 LOC / 生产源文件。**

| 文件 | 动作 |
|------|------|
| `universe.rs` | → `universe/mod.rs` + `dto.rs` + `schema.rs` + `snapshot.rs` + `mutations.rs` + `ids.rs`（测试可 `tests` 子模） |
| `obsidian.rs` | 若修复后 >700：→ `obsidian/{mod,slug,frontmatter,concept,residue,sanitize}.rs` |
| `workspaceStore.ts` | → `state/turnHelpers.ts` + `spawnMerge.ts` + `chatActions.ts` + 薄 `workspaceStore.ts` |
| `host.ts` | 只追加 invoke；不框架化 |
| Map/* | **冻结** |

---

## 10. OUT 围栏（本波禁止）

- Agent tool loop / 子 Agent  
- 图谱 LOD 新故事、MindScape  
- 插件市场、技能 GUI 编辑器  
- merge 探究、第三种 NodeKind  
- per-card transcript 镜像  
- Message 表重写、流式炫技  
- OS keychain（可文档后置）  
- 云同步  

Skills：**本波 = 注入说明**；UI/docs 不得暗示 Agent 已能改写技能文件。

---

## 11. 验收剧本

### 11.1 自动（必须）

1. Rust: open temp vault → create_root → append_turn → update_turn ai → reopen → turns 仍在  
2. Rust: append on parent → spawn deepen → parent turns 仍在  
3. Rust: update_card unread false → reopen → unread false  
4. Rust: open 相对路径 → err  
5. Rust: precipitate 预置 `tags:` → 仍在  
6. FE: deepenScope 含 parent.question/stuck/next；无父 turns  
7. FE: universe mock host：append 走 host；spawn 失败无新节点  
8. `cargo test` + `npm test` + `tsc --noEmit` 全绿  
9. 触及的生产文件均 ≤800 LOC  

### 11.2 手工（桌面）

1. 绑 vault → 建根 → 发送 2 轮 → 杀进程 → 重开 → 恢复 vault → 对话在  
2. 深挖 → 回源高亮  
3. 写入概念（先手改 tags）→ tags 仍在  
4. 失败 spawn（断 DB）→ 错误可见、无鬼卡  

---

## 12. 成功定义

可宣称本波完成 **当且仅当**：

- D1–D5、H1–H4、O1–O4、I1–I3、P1–P3 均可指证  
- §11.1 全绿  
- 产品叙事可改为：「绑库后主路径会话耐久」  

否则仍称 **scaffold + partial host**。

---

## 13. 波次与并行边界

见 `知识库/plans/2026-08-20-g-*.md`：

| Plan | 名 | 可写核心 |
|------|-----|----------|
| G1 | universe turns + split | `src-tauri/src/universe*` + 相关 lib 命令注册 |
| G2 | obsidian harden | `src-tauri/src/obsidian*` |
| G3 | session restore + path + CSP | session config、open 路径、CSP、App/LeftRail 恢复 |
| G4 | FE write-through + scope + store split | `src/state/*`、`host.ts`、`types.ts`、`deepenScope*` |

G1/G2/G3 可并行；G4 依赖 G1 命令名（以本 Spec §5 为准，可与 G1 并行对接）。
