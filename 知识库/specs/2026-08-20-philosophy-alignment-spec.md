# 知识库理念对齐 — Spec v1.0

> 日期: 2026-08-20  
> 依据: `知识库/docs/共识.md`、`对象模型.md`、`非目标.md`；四路实现审计（两层记忆 / 主循环 / Host·Skills·轻快 / 非目标漂移）  
> 基线分支: `feature/tauri-workspace-scaffold`  
> 前置: Tauri 壳 + 内存 demo 工作区 UI 已落地；本 Spec **纠偏主线**，停止「只抛光壳、不接核」  
> 状态: **v1.0 待 Oracle**（用户确认后开 v1.1 + plans）

---

## 摘要

对照知识库拍板的产品身份，当前仓库是 **会话 UI 壳 + 薄 Tauri 进程**，不是可天天用的 Agent Host。  
卡片分叉与图导航的**手势已可演示**；`universe.db`、真对话/BYOK、源跨度回边、Obsidian 沉淀原子、SKILL.md **均未实现**。  
本 Spec 规定下一阶段必须按理念补齐的 **IN 主线**、明确 **OUT 围栏**、分波交付与验收，使实现重新对齐「会话操作系统 + 两层记忆 + 本机 Host」，而不是 Explore 类卡片客户端。

---

## 0. 审计结论（四路 subagent 合并）

### 0.1 总判

| 维度 | 结论 |
|------|------|
| 方向违背 | **无结构性 VIOLATES**（未做成插件/云/一卡一笔记实现/第三种树节点） |
| 完成度 | **壳 ≫ 核**：导航与观感超前；Host/记忆/对话内核空洞 |
| Demo 性质 | **欠规格脚手架**，不是模型写反；但文案占位有漂移风险 |

### 0.2 清单汇总（精简）

| 理念点 | 状态 |
|--------|------|
| 本机独立进程 / 非 Obsidian 插件 | PARTIAL（壳有，Host 未成） |
| 卡片 = 探究 + messages + status | PARTIAL（有 turns，无 status/question/stuck/next） |
| `universe.db` 一库一宇宙 | MISSING（内存 store） |
| 深挖/发散手势先选方向 | IMPLEMENTED（UI） |
| 深挖作用域 / 发散空白+回边 | PARTIAL（文案 stub） |
| 源跨度回跳高亮 | MISSING |
| 重生不长节点 | IMPLEMENTED |
| 真 LLM / BYOK | MISSING |
| SKILL.md 技能 | MISSING |
| Obsidian concepts/残渣写出 | MISSING |
| 代码插件市场 | SAFE（未做，且 v1 不做） |
| 冷启动无重 IO | IMPLEMENTED（bootstrap） |

### 0.3 最严重缺口（实现优先级）

1. **`universe.db` + vault 绑定与隔离**（含：选 vault 后禁止静默灌 demo）  
2. **Inquiry 状态字段 + 边/源跨度模型**  
3. **ChatPort + BYOK（可先 mock 同接口）使主循环变真**  
4. **回源跨度高亮**  
5. **沉淀写出原子 + 防覆盖**（改掉假「收藏」语义）  
6. **SKILL.md 装载与启停**（文件即配置，无 GUI 市场）

### 0.4 文案/入口漂移（规格必须改名或接真）

| 现状 | 风险 | 规格要求 |
|------|------|----------|
| 「沉淀 / 收藏卡片」本地 toggle | 像书签或一卡一笔记 | 未接写库前改「钉选」或隐藏；接上后=写 concepts/残渣 |
| 「收藏本轮」 | 同上 | 改「钉住本轮」或接真偏好存储 |
| 左栏「宇宙 / 记忆 / 技能」disabled | 像 MindScape / 应用内 PKM / 插件市场 | 见 §7 命名围栏 |
| 图谱「总览」过重投入 | 像第二世界 | 总览=树缩略投影，禁止可编辑空间画布 |

---

## 1. 现状（代码事实）

### 1.1 已有（可保留）

- Tauri 2 壳、`get_bootstrap_state` 瞬时 `ready_ui`  
- React 工作区：卡、轮次、composer、mark/选区 → 方向选择 → spawn  
- `NodeKind`: root | deepen | diverge；`regenerateTurn` 不增节点  
- 树导航：locus / map / crumbs / source chip（回父）/ Ctrl+K / 活线·线债 UI  
- 前端观感持续打磨（栈、动效、图谱 LOD）— **维护级，不再作为主故事**

### 1.2 明确没有

- SQLite / `vault/.soit/universe.db`  
- 真消息角色模型、流式对话、provider 配置  
- `Edge` + `SourceSpan` 一等数据  
- 回父卡**原文 mark** 高亮  
- `.soit/skills/**/SKILL.md`  
- Obsidian `concepts/` / residue 写出  
- 选 vault 后的真宇宙加载（`App.tsx` 在 empty 时仍 `demoSnapshot()`）

---

## 2. 目标：理念必须在实现中可指证

下列每条都必须能在代码 + 手工验收中指证，而不是只在文档中成立。

### 2.1 身份

| ID | 不变量 | 验收 |
|----|--------|------|
| I1 | Soit 是本机 Agent Host 进程 | Tauri 独立 App；无 Obsidian 插件包 |
| I2 | 第一性工作 = 管理/恢复/分叉探究会话 | 主路径无课程/测验/路径生成器 |
| I3 | Obsidian = 真实内存后端，不是第二聊天 | 无应用内笔记编辑器；写库为工具/沉淀 |

### 2.2 两层记忆

| ID | 不变量 | 验收 |
|----|--------|------|
| M1 | 卡片只活在 `universe.db` | 卡数据不落成 per-card 会话 md |
| M2 | 一 vault 一宇宙；DB 在 `vault/.soit/universe.db` | 换 vault 不串卡；拷贝 vault 可带走宇宙 |
| M3 | 卡 = 探究：至少 title + status + question + messages + 边 | 类型/表/UI 可见状态 |
| M4 | 写出原子：概念页 + 残渣；必含 card id 回链 | 沉淀后检查 vault 文件形态 |
| M5 | 禁止整卡 transcript 镜像；禁止一卡一笔记 | 代码路径 + 文件检查 |
| M6 | 用户改过的概念正文默认不覆盖 | 二次沉淀策略可测 |

### 2.3 非线性主循环

| ID | 不变量 | 验收 |
|----|--------|------|
| L1 | 对话属于卡 | message 写入当前 cardId |
| L2 | 点 mark / 选区 → **先选** 深挖或发散 → 建卡 | 无静默深挖 |
| L3 | 深挖：边带源跨度；上下文 = 本卡消息 + 父状态 + span + why；不默认灌父全文 | scope 组装可单测 |
| L4 | 发散：新卡 messages 空；父不自动 pause；边可回源 | 数据 + UI |
| L5 | 重生只改卡内，不建节点 | 测试已有，保持 |
| L6 | 回源跨度：子卡 → 父卡定位并高亮原文 | 手工剧本 |
| L7 | 用户与 Agent 共用同一 spawn 规则 | `actor: user\|agent` API |

### 2.4 Host / 轻快 / 技能

| ID | 不变量 | 验收 |
|----|--------|------|
| H1 | Bootstrap 无 DB open、无网络、无全库 walk | 测试/日志断言 |
| H2 | 业务权威逐步迁到 Host+DB；前端不为唯一真源 | 重启后树仍在 |
| H3 | BYOK：本机配置 provider；密钥不进 git、不进 db 明文 | 配置路径约定 |
| H4 | 技能 = SKILL.md 文本；人改即生效；Agent 可启停改写 | 改文件后行为变 |
| H5 | v1 **无**代码插件加载、无市场、无技能 GUI 编辑器 | 无入口 |
| H6 | 可预留 `vault/.soit/plugins/` 占位 README，加载器不存在 | 目录约定 |

---

## 3. 需要做的工作（分波）

### Wave A — 宇宙与 Vault（P0）

**问题：** 卡片无持久化；选 vault 名存实亡。

**做：**

1. Rust：打开 vault → 确保 `vault/.soit/` → 打开/迁移 `universe.db`（懒开，不在 bootstrap）。  
2. Schema 最小：cards、edges、messages（或 turns）、meta(schema_version)。  
3. Cards 字段对齐：`status, question, stuck, next, timestamps` + 现有 title/kind 派生。  
4. Commands：`open_universe`、`get_workspace_snapshot`（读 DB）、基础 mutate。  
5. 前端：`select_vault` UI；有 vault 时 **禁止** 静默 `demoSnapshot()`；无 vault 才允许 demo 且标记 `source:"demo"` 不写盘。  
6. 换 vault：清空 store、关旧 DB、开新宇宙。

**不做：** 全库 md 索引、PKM 搜索。

### Wave B — 边、跨度、主循环数据（P0）

**问题：** 只有 `parentId+kind`，无法表达源跨度与回源。

**做：**

1. `SourceSpan { turnId, text, markId? , start?, end? }`。  
2. `Edge { id, kind: deepen\|diverge, fromCardId, toCardId, source, why? }`。  
3. 统一 `spawnInquiry({ kind, source, why?, actor })`；UI 与未来 agent 同入口。  
4. 发散：新卡 **无** 预置开场 turn。  
5. 深挖：`buildDeepenScope(cardId, edgeId)` 纯函数 + 单测。  
6. Source chip / 导航：回父并 **scroll + highlight** 源 mark（CSS 短暂高亮）。  
7. 父 mark：能查询「是否已有出边」（v1 可仍新建，但数据可查）。

### Wave C — ChatPort + BYOK（P0）

**问题：** 发送是假回复。

**做：**

1. `ChatPort.complete({ cardId, messages, scope })` 接口；先 **MockChat** 实现（结构化 marks），再 **OpenAI-compatible BYOK**。  
2. 密钥：OS keychain 或 app config（规格写清）；不进仓库。  
3. `appendUserMessage` → port → 追加 assistant；marks 由回复结构化字段生成。  
4. Composer 去掉永久「Local · demo」伪装；未配置 key 时明确空态。  
5. regenerate 走同一 port，仍不建节点。

### Wave D — Obsidian 沉淀（P0/P1）

**问题：** 真实内存层为零；「沉淀」假控件。

**做：**

1. 工具 + UI：「沉淀概念」/「记下残渣」，**不是**收藏 toggle。  
2. 写出：  
   - `concepts/{slug}.md` + frontmatter `soit_card_ids`  
   - residue 目录（如 `inquiry/`）追加 + card id  
3. 禁止整卡 md、禁止逐条消息同步。  
4. 覆盖守卫：用户编辑检测（hash/mtime/标记区）；默认不覆盖正文。  
5. 改名：未就绪的「收藏」→「钉选」或移除。

### Wave E — SKILL.md（P1，与 C 可部分并行）

**问题：** 可扩展性未体现。

**做：**

1. 路径 `vault/.soit/skills/<id>/SKILL.md`。  
2. 开宇宙时索引；发送前合并 enabled skills 进 system/tool 上下文。  
3. Seed：`organize-cards`、`organize-obsidian`（意图文档 + 允许的 tools）。  
4. Agent tools：list/enable/disable/read/write skill（写 md）。  
5. UI：设置页列表 + 开关即可；**无**市场、**无**可视化编辑器。  
6. 预留 `vault/.soit/plugins/README.md`（v1 ignore）。

### Wave F — 壳层收敛（与 A–E 穿插，小）

1. 左栏命名围栏（§7）。  
2. 图谱：维持导航投影；总览不演进为可编辑空间；压测仅 DEV。  
3. 活线/停养：文档写清 = 注意力集合，≠ 探究 status。  
4. UI polish **冻结新故事**；只修正确性/性能/已有动效。

---

## 4. 文件变更清单（预期）

| 区域 | 变更 | Wave |
|------|------|------|
| `src-tauri/` | db、open_universe、migrate、chat/byok 配置、skill 读文件、obsidian write tools | A–E |
| `src/lib/host.ts` | 扩展 invoke 面 | A–E |
| `src/types.ts` + store | Edge、Span、status、messages | B–C |
| `src/components/card/**` | 回源高亮、沉淀真流程、composer 空态 | B–D |
| `src/components/shell/LeftRail` | vault 真状态、命名 | A, F |
| `src/App.tsx` | 宇宙加载策略，禁选库后灌 demo | A |
| `vault 约定` / 文档 | `.soit` 布局、技能 seed | A, E |
| 前端图谱/动效 | **仅 bugfix**，无新产品面 | F |

---

## 5. 架构（目标）

```text
┌─────────────────────────────────────────────┐
│  React：视图 + 手势（卡 / 图 / 选区）          │
│     │ invoke                                   │
│     ▼                                           │
│  Tauri Host（Rust）                             │
│     ├─ UniverseDb  (.soit/universe.db)         │
│     ├─ ChatPort    (BYOK / mock)               │
│     ├─ Tools       (card, span, write md, skill)│
│     └─ SkillsIndex (.soit/skills/**/*.md)      │
│             │                                    │
│             ▼                                    │
│  Obsidian vault（人读 md：concepts / residue）   │
└─────────────────────────────────────────────┘
```

不变量：卡片权威在 DB；笔记权威在 md；禁止用 md 镜像会话树。

---

## 6. 实施顺序

```text
Wave A  universe.db + vault UI/isolation
Wave B  edges + spans + scope + return-to-source   (可与 A 尾重叠)
Wave C  ChatPort + mock then BYOK                  (依赖 B scope)
Wave D  Obsidian write atoms + 沉淀语义            (依赖 A path)
Wave E  SKILL.md                                   (依赖 A path；C 后注入更完整)
Wave F  naming fence + polish freeze               (全程)
```

| 阶段 | 依赖 | 工作量（量级） |
|------|------|----------------|
| A | — | L |
| B | A 基础 API 或双写过渡 | L |
| C | B | L |
| D | A | M |
| E | A | M |
| F | — | S |

---

## 7. 命名围栏（强制）

| 禁止/慎用 | 改用 |
|-----------|------|
| 宇宙（左栏一级） | 本库 / 工作区 / 显示 vault 名 |
| 记忆（应用内库） | 在文件管理器/Obsidian 打开 vault |
| 技能（像市场） | 设置 → 技能（SKILL 列表） |
| 沉淀/收藏（未写库时） | 钉选；写库后「写入概念/残渣」 |
| 停养 = 停父探究 | 移出活线（注意力） |
| 总览 = 思维宇宙 | 树缩略 / 结构总览 |

---

## 8. 验收标准

### 8.1 主循环剧本（必过）

1. 选 vault → 创建 `.soit/universe.db` → 新建或打开根探究。  
2. 配置 BYOK 或启用 MockChat → 发送 → 卡内出现 assistant（可含 marks）。  
3. 点 mark → 选深挖 → 新卡；scope 可解释（UI 或 debug 面板可见摘要）。  
4. 子卡「来自」→ 父卡原 span/mark 高亮。  
5. 另选区发散 → 新卡消息空、可回源；父卡仍可发送。  
6. 重生 → 节点数不变。  
7. 重启 App → 树与消息仍在。

### 8.2 记忆剧本

1. 沉淀概念 → `concepts/` 出现页且含 card id。  
2. 记残渣 → residue 文件可回链卡。  
3. 无 per-card 全 transcript 文件。  
4. Obsidian 改概念正文后再次沉淀不覆盖用户段。

### 8.3 技能与轻快

1. 修改某 SKILL.md → 新一轮对话行为变化（mock 可断言注入文本）。  
2. 无插件市场入口。  
3. `get_bootstrap_state` 路径无 open DB、无网络（自动化断言）。  
4. README 记录一次 release 冷启动可点击时间（目标 ≤2s，未达标须注明）。

### 8.4 非目标抽检

- 无第三种 NodeKind、无 merge、无课程/SRS、无第二编辑器。

---

## 9. 不在范围（本 Spec 明确 OUT）

- 代码插件执行 / 插件市场 / 技能可视化编辑器  
- 子 Agent 舰队  
- MindScape 级可编辑空间  
- 合并探究、树上「重来」节点  
- 一卡一笔记、聊天导出目录  
- 课程/测验/目标锁/路径生成  
- 云多租户、挂到其他 Host  
- 继续以「图谱压测/动效」为主要里程碑叙事  

---

## 10. 风险

| 风险 | 缓解 |
|------|------|
| 继续只做 UI | 本 Spec 将 polish 降为 F；A–C 无验收不算对齐 |
| 沉淀滑向一卡一笔记 | M4–M5 + 命名围栏 + 代码 review 清单 |
| 选 vault 仍加载 demo | A 验收硬条件 |
| BYOK 范围爆炸 | 先 OpenAI-compatible 单一路径 + Mock |
| DB 阻塞启动 | 懒开；bootstrap 永不 open DB |

---

## 11. 成功定义

当且仅当：

1. 知识库共识中的 **身份 / 两层记忆 / 分叉 / Host / 技能（SKILL.md）** 均可在运行路径中指证；  
2. 「学一个概念：卡上聊 → 分叉 → 图上跳 → 回源跨度」有 **真数据** 剧本通过；  
3. 非目标表抽检全 SAFE；  
4. 启动纪律（轻 bootstrap）不回归。

**在此之前，不得宣称 Soit 已实现知识库设计理念；仅可宣称 UI 骨架与部分手势对齐。**

---

## 12. 版本变更

| 版本 | 说明 |
|------|------|
| v1.0 | 四路审计合并；理念对齐主线 Spec；待 Oracle / 用户确认后拆 plans |

---

## 附录 A — 审计来源

- 两层记忆审计 subagent  
- 非线性主循环审计 subagent  
- Host / Skills / 轻快审计 subagent  
- 非目标漂移审计 subagent  

## 附录 B — 与既有 Spec 关系

- `2026-08-19-tauri-workspace-scaffold-spec`：壳与 demo UI — **完成其声明范围**  
- `2026-08-19-map-scale-lod-spec`：导航投影 — **维持，不再扩展产品面**  
- **本 Spec 取代「下一步随便做什么」**，成为实现优先级真源，直到 v1 闭环验收  
