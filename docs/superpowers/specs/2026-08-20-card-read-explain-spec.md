# 卡片可读性与短解释 — Spec v1.1

> 日期: 2026-08-20  
> 依据: 用户拍板「先懂再分叉、不做批注系统」；三路调研（card render / state+fork / docs intent）；`知识库/docs/共识.md` §2–3·§8；`对象模型.md` 下划线手势；`非目标.md`；`src/components/card|overlays/AGENTS.md`；Explore 调研笔记（仅借手势，不抄产品）；Oracle APPROVE-WITH-MINOR  
> 基线分支: `main`  
> 前置依赖: ChatPort（mock + BYOK）；`completeResultToHtml` + marks；TermFloat / SelectionBar / DirectionChooser；spawn 深挖/发散；composer quote chip

---

## 摘要

探究卡 AI 回复目前几乎是「转义纯文本 + `<br>` + 下划线」，点概念只有**静态 demo 词条**，划词不能要解释。本 Spec 落地三件事：**安全子集富文本排版**、**真 AI 短解释（点词/划词，默认不建卡）**、**分叉与引用手势收齐**——明确 **不做** MiniMax 式文档批注层。

---

## 0. 前置依赖

| 已有 | 说明 |
|------|------|
| `ChatPort.complete` | mock + `OpenAICompatChat`；`[[term]]` → marks |
| `completeResultToHtml` / `applyMarksHtml` / `escapeHtml` / `stripHtml` | `src/lib/chat/port.ts` |
| `TurnItem` `dangerouslySetInnerHTML` | 渲染 `turn.aiHtml` |
| Mark click → `TermFloat` | body = `termExplanation()` 静态表 `src/lib/marks.ts` |
| 划词 → `SelectionBar` | 预览 / 引用 / 复制；无解释 |
| `DirectionChooser` | 仅 深挖 / 发散 |
| `spawnInquiry` + `SourceSpan` | 分叉权威路径 |
| Composer quote chip | `> quote` 前缀进 user 文本 |
| 共识：点 mark **先选方向**；重生不建节点；无第三种边 | 不可违背 |

**工作树注意：** `main` 上另有未提交的 shell/orbit 改动；另有 **Agent dual-track** spec 将改 `port.ts`（`signal`）、`chatActions.ts`、`mockChat`/`openaiCompat`、Composer。本 Spec 实现应：  
- 避开 `FocusOrbit*` / `PathLineNav*` / `orbitNav*` / `SettingsPanel*`；  
- 与 dual-track **协调** chat 路径：解释走独立 `explain`/`explainSpan`，复用 `resolvePort`，不平行再造 completion 栈；卡片/overlays 仍为本波 UI 主战场。

---

## 1. 现状

### 1.1 渲染（非 Markdown）

| 事实 | 证据 |
|------|------|
| 无 markdown 库 | `package.json` 无 marked/remark/react-markdown |
| 模型文本全量 escape 后塞 mark，`\n`→`<br>` | `port.ts` `completeResultToHtml` |
| 用户气泡纯文本 `pre-wrap` | `TurnItem.tsx` |
| 历史回灌模型用 `stripHtml` | `turnHelpers.ts` |
| XSS 立场正确：不信任模型 HTML | `port.ts` 注释 + `mockChat.test.ts` |

### 1.2 概念下划线

| 事实 | 证据 |
|------|------|
| marks 来自 port `marks[]` 或 `[[term]]` | `mockChat.ts` / `openaiCompat.ts` |
| 首次出现子串包裹 `.mark` | `applyMarksHtml` |
| 点击 → TermFloat + **静态** `termExplanation` | `InquiryCard.tsx` + `marks.ts` |
| `ChatMark.explanation` 类型存在但 **未写入 HTML、未进浮层** | `port.ts` `ChatMark`；TermFloat 只收 `body` 字符串 |
| 浮层动作：深挖 / 发散 / 关闭 | `TermFloat.tsx` |
| **禁止**静默深挖 | `overlays/AGENTS.md` |

### 1.3 划词

| 事实 | 证据 |
|------|------|
| 仅 assistant `.ai-html`，≥2 字，忽略点在 `.mark` 上 | `TurnItem` mouseup |
| SelectionBar：预览→DirectionChooser；引用；复制 | `SelectionBar.tsx` |
| **无**「解释」入口 | — |

### 1.4 产品意图 vs 实现落差

| 意图（共识） | 实现 |
|--------------|------|
| 对话 → 不会 → 点下划线 → 选方向 → 新卡 | 分叉路径在；「先懂」假 |
| Explore 式浮层解释 | 文档写「不必抄」；scaffold 用静态 demo |
| 用户可批注 Markdown 再让 AI 回 | **非目标**；用户已否决整套批注 |

### 1.5 用户已拍板（本 Spec 锁定）

1. **主路径 = 先短解释，再可选深挖/发散**（不是一点就建卡）。  
2. **不做**文档批注 / 注释线程 / 钉选批注层。  
3. AI 回复要**更好读**（列表/标题/代码等），卡片**不是**可编辑 MD 笔记。  
4. 划词与点词同一套「解释 + 分叉 + 引用」。

---

## 2. 需要做的工作

### 2.1 安全子集富文本（P0）— 「回复好读」

**问题：** 只有 `<br>`，长回复难扫读。

**方案：**

1. 新增纯函数 `renderAssistantHtml(text, marks?)`（可放 `src/lib/chat/assistantHtml.ts`），替换 `completeResultToHtml` 的实现或由其委托。  
2. **零新运行时依赖（P0 默认）**：手写 **安全 Markdown 子集** 管线。XSS 硬规则：任何白名单标签只来自管线；**禁止**解析模型原始 `<>`。  
   **推荐顺序（锁定）：**  
   - **A.** `escapeHtml(text)`（全量转义）  
   - **B.** 结构/代码保护（在已转义串上）：围栏 ` ``` ` → 占位/先生成 `<pre><code>…</pre>`；行内 `` `code` `` → `<code>`（代码区内 **不再**跑 marks / 加粗）  
   - **C.** `wrapMarks`：**仅在代码/占位之外**对 term 明文做首次子串包裹（`class="mark" data-term data-mark-id`）。`applyMarksHtml` 今日内含 `escapeHtml`——须拆成「已转义上 wrap」或让 `renderAssistantHtml` 只 escape 一次，避免双重转义。  
   - **D.** 其余子集（段落/`<br>`/标题/列表/`**`/`*`）在已转义 + marks 后运行：**跳过** `<span class="mark"…>…</span>` 与 `<pre>`/`<code>` 内部；**不得**拆开 mark 标签。  
   - 单测必含：`**mark-term**` 共存；fence 内同名 term **无** `.mark`；裸 `<script>` 仍为文本。  
3. **子集白名单（v1）：**  
   - 段落：空行分段 → `<p>`  
   - 换行：段内 `\n` → `<br>`  
   - `**` / `*` → `<strong>` / `<em>`（实现可只做 `**` + `*`）  
   - 行首 `- ` / `* ` 无序列表 → `<ul><li>`  
   - 行首 `1. ` 有序 → `<ol><li>`（可选 P1，P0 可只做无序）  
   - 行首 `### ` / `## ` / `# ` → `<h3>`/`<h2>`/`<h1>`（建议样式收敛为卡内小标题，视觉不要巨大）  
   - 行内 `` `code` `` → `<code>`  
   - 围栏 ` ``` ` → `<pre><code>`（语言标记可忽略）  
   - 链接：**P0 不做可点外链**（或只渲染文本）；避免 `javascript:`  
4. **禁止输出：** 任意裸标签、`<script>`、`<iframe>`、`on*`、未白名单属性。  
5. `stripHtml` 扩展：识别 `</p>`/`</li>`/`</h1-3>`/`</pre>` 为合理换行，保证回灌模型可读。  
6. CSS：`.ai-html` 增加 `p/ul/ol/li/pre/code/h1-h3` 间距与字号（`card.css`），保持纸感，不引入「文档站」气质。  
7. 测试：`assistantHtml.test.ts` — escape 仍防 XSS；`**x**`；列表；fence；mark 与 `**` 共存；`[[` 路径经 port 后 mark 仍可点。

**验收锚点：** mock/BYOK 回复含 markdown 记号时，卡内可见结构；恶意 `<script>` 仍为文本。

**R1 文件所有权：** `assistantHtml.ts` + tests + `card.css` + `completeResultToHtml` 委托 / `stripHtml` 扩展。**不改** `ChatPort` 接口区。

---

### 2.2 短解释 Port 与会话态（P0）— 「真 AI 解释」

**问题：** `termExplanation` 是死表；`ChatMark.explanation` 未用。

**方案：**

1. **扩展 ChatPort（推荐最小面）：**  
   ```ts
   // port.ts
   export interface ChatExplainInput {
     cardId: string;
     /** 要点/选区原文 */
     span: string;
     /** 可选：本卡最近对话摘要或末 N 条，由调用方组装 */
     contextMessages?: ChatMessage[];
     /** 与 dual-track complete 对齐；P0 可先只做 seq 忽略 */
     signal?: AbortSignal;
   }
   export interface ChatPort {
     complete(input: ChatCompleteInput): Promise<ChatCompleteResult>;
     /** 短解释：2–4 句，不要求 marks，不写库。R2 起 Mock/OpenAI 均实现。 */
     explain?(input: ChatExplainInput): Promise<{ text: string }>;
   }
   ```  
   - **唯一调用入口：** `explainSpan`（`chatActions` 或 `explainActions`）。UI/overlays **不得**直接 `port.explain` / `fetch`。  
   - 若运行时 `!port.explain`：仅在该包装内 fallback = `complete` + 强 system「2–4 句解释 span；禁止大纲与 [[marks]]」；v1 两实现都带 `explain` 时 fallback 仅兜底。  
2. **MockChat.explain：** 返回**可断言**固定前缀文案，例如 `（MockExplain）${span}：…`，**不得**原样复用 `marks.ts` / 仅回声 `GLOSSARY.explanation`（避免与旧死表无法区分）。  
3. **OpenAICompat.explain：** 独立 system；`temperature` 略低；截断 span≤500 字、展示≤800 字；若入参有 `signal` 则传入 `fetch`。  
4. **不落库：** 解释只在浮层会话态（React state / 可选 cache key=`cardId+span`）。  
   - **不**新增 Turn / **不**写 universe.db / **不**写 Obsidian  
5. **调用位置：** `InquiryCard` → `explainSpan`。**禁止** overlay 网络/host（overlays AGENTS）。  
6. **可选优化（P1）：** `marks[].explanation` 非空时可作首屏，仍可「再生成」；P0 只走 `explain()`。  
7. **失败：** 错误文案 + 重试；深挖/发散在 loading/error 仍可点。  
8. **加载/竞态：** body「解释中…」；每次 open/close/retry 递增 **seq**；关闭后迟到响应丢弃。P0 不强制 AbortController；与 dual-track `signal` 对齐时再接到 `explain`。

**验收锚点：** demo/mock 下点 mark 得到含 `（MockExplain）` 前缀正文；无 vault 也可解释（走 ChatPort，不依赖 universe）。

**R2 文件所有权：** `ChatExplain*` 类型 + `ChatPort.explain?`（独占 `port.ts` 接口区）+ mock/openai `explain` + `explainSpan` + tests。

---

### 2.3 TermFloat：先解释，再分叉（P0）

**问题：** 浮层假定 body 已就绪；无 loading；文案暗示「本地预览」。

**方案：**

1. 扩展 `TermFloatState`：  
   ```ts
   {
     /** 展示标题（mark=术语；selection 可截断） */
     term: string;
     /** 解释/分叉/引用用的全文；mark 路径与 term 相同 */
     span: string;
     body: string;
     status: "loading" | "ready" | "error";
     error?: string;
     x: number; y: number;
     source: "mark" | "selection";
     /** InquiryCard 已有扩展：spawn SourceSpan */
     turnId?: string;
     markId?: string;
   }
   ```  
   **锁定：** `explain({ span })`、深挖/发散 `SourceSpan.text`、P1 引用 chip 一律用 **`span`**，不用截断后的 `term`。  
2. UI：  
   - loading：spinner/文案  
   - ready：纯文本段落（解释 **P0 不做富文本**，防嵌套复杂度）  
   - error：文案 +「重试」  
   - 工具按钮：**深挖 | 发散 | 关闭**（保持）；可选 P1「引用到输入框」（写入 `span`）  
3. 页脚文案改为：短解释不建卡；要继续探究再选深挖/发散。  
4. **点击 mark 流程（锁定）：**  
   - open float（loading, span=term）→ 经 `explainSpan` 调 port → ready  
   - **不**自动 spawn  
   - 深挖/发散仍须 **显式点击**（满足「先选方向」；解释层不算静默深挖）  
5. 废弃 UI 对 `termExplanation` 的依赖；`marks.ts` 可删或仅留 `isMarkElement` / `markTermFrom` 工具函数。  
6. **键盘：** 保持 `InquiryCard` 现有 Esc 链（chooser → selbar → float → fullscreen）；关闭 float 时 bump seq，忽略迟到 explain。

---

### 2.4 SelectionBar：解释入口（P0）

**问题：** 划词不能解释。

**方案：**

1. SelectionBar 增加 **解释** 按钮（主按钮可略强调，或放在预览前）。  
2. 动作：关闭 selbar → 打开 TermFloat：  
   - `source: "selection"`  
   - `span: selBar.text`（全文，供 explain / 深挖 SourceSpan / 引用）  
   - `term: 展示用截断（如前 24 字 + …）`  
   - `turnId: selBar.turnId`  
   → 同 2.2 `explainSpan`。  
3. 保留：**预览**（→ DirectionChooser）、**引用**、**复制**。  
4. 文案 tip：「短解释（不建卡）」。  
5. 与 mark 点击互斥：一边打开关另一边（沿用 InquiryCard 现逻辑并覆盖解释路径）。

---

### 2.5 引用手势收齐（P1，可与 P0 同波若低冲突）

**问题：** quote 已可用但发现性弱；解释后想接着问要多步。

**方案：**

1. TermFloat 增加 **引用**（把 **`span`** 送进 composer quote chip）——P1。  
2. 引用后自动 focus composer（若尚无）。  
3. 不改 quote 存储格式（仍 `> …\n\n` 进 user）。

---

### 2.6 产品文档与 AGENTS（P1）

1. `知识库/docs/对象模型.md` **必改**下划线手势第 3 步为：  
   > 点击标记或划词可先短解释（不建卡、不落库）；建卡仍须显式选深挖或发散。  
   `共识.md` **建议**将 §2 回路「点下划线 → 选方向 → 进新卡」改为「点下划线 → 短解释（可选）→ 选方向 → 进新卡」；Q11 仍读作「建卡前先选方向 / 禁止静默深挖」，不引入第三种边。  
2. `src/components/card/AGENTS.md`：assistant 为安全子集 HTML；解释走 `explainSpan`，不 silent-deepen。  
3. `src/components/overlays/AGENTS.md`：TermFloat loading/error/retry；仍禁止 overlay 内网络/host。  
4. `src/lib/AGENTS.md`：`renderAssistantHtml` 顺序与 `explain`/`explainSpan` 契约；marks 工具与死表脱钩。

---

### 2.7 明确不做（见 §7）

批注层、解释落库为 Turn、可点外链、技能市场、第三分叉、静默深挖、复用已有子卡（可另 Spec）。

---

## 3. 文件变更清单

| 文件 | 变更 | 节号 | 计划 |
|------|------|------|------|
| `src/lib/chat/assistantHtml.ts` | **新建** 安全子集渲染 | 2.1 | R1 |
| `src/lib/chat/assistantHtml.test.ts` | **新建** 单测 | 2.1 | R1 |
| `src/lib/chat/port.ts` | R1：`completeResultToHtml` 委托 + `stripHtml`；R2：`ChatExplain*` + `explain?`（分段） | 2.1–2.2 | R1/R2 |
| `src/lib/chat/mockChat.ts` | 实现 `explain`（MockExplain 前缀） | 2.2 | R2 |
| `src/lib/chat/openaiCompat.ts` | 实现 `explain` | 2.2 | R2 |
| `src/lib/chat/index.ts` | 导出（分段） | 2.1–2.2 | R1/R2 |
| `src/lib/chat/explain.test.ts` 或 mock 扩展 | mock explain 断言 | 2.2 | R2 |
| `src/lib/marks.ts` | 删除/收缩静态词条；保留 DOM helpers | 2.3 | R3 |
| `src/state/chatActions.ts` 或 `explainActions.ts` | `explainSpan` 单入口 | 2.2 | R2 |
| `src/components/card/InquiryCard.tsx` | mark/selection → explain；float.span；seq | 2.3–2.4 | R3/R4 |
| `src/components/card/TurnItem.tsx` | 若需 class 微调 | 2.1 | R1 |
| `src/components/card/card.css` | `.ai-html` 富文本样式 | 2.1 | R1 |
| `src/components/overlays/TermFloat.tsx` | loading/error/retry；span | 2.3 | R3 |
| `src/components/overlays/SelectionBar.tsx` | 解释按钮 | 2.4 | R4 |
| `src/components/card/icons.tsx` | 若需解释 icon | 2.4 | R4 |
| `src/components/card/AGENTS.md` | 规则更新 | 2.6 | R5 |
| `src/components/overlays/AGENTS.md` | 规则更新 | 2.6 | R5 |
| `src/lib/AGENTS.md` | 契约 | 2.6 | R5 |
| `知识库/docs/对象模型.md` | **必改**下划线手势 | 2.6 | R5 |
| `知识库/docs/共识.md` | **建议**回路一句 | 2.6 | R5 |

**冲突隔离：** 本波 **不改** `FocusOrbit*`, `PathLineNav*`, `orbitLayout*`, `SettingsPanel*`。  
**并行冲突文件：** `port.ts` / `chat/index.ts` 必须分段或短时串行（见 §5）。

---

## 4. 架构图

```text
[Model complete]
    → text + marks[]
    → renderAssistantHtml (escape → code protect → wrapMarks → md-subset)
    → turn.aiHtml
    → TurnItem dangerouslySetInnerHTML
            │
            ├─ click .mark ──┐
            │                ▼
            │         InquiryCard → explainSpan (唯一入口)
            │                │
            │                ▼
            │         ChatPort.explain ──► TermFloat (loading→ready)
            │                │                 │  span = full text
            │                │                 ├─ 深挖 ─► spawnInquiry(deepen, SourceSpan.text=span)
            │                │                 ├─ 发散 ─► spawnInquiry(diverge)
            │                │                 └─ 关闭 / 引用(P1, quote=span)
            │
            └─ select text ─► SelectionBar
                               ├─ 解释 ─► 同上 TermFloat (span=全文)
                               ├─ 预览 ─► DirectionChooser ─► spawn
                               ├─ 引用 ─► composer quote
                               └─ 复制
```

不变量：

- 解释 **永不** 自动 spawn  
- 建卡 **仅** 深挖/发散显式动作  
- 解释 **不** 写 db / 不 新增 Turn  
- explain/spawn/quote 一律用 **`span` 全文**，不用截断 `term`  

---

## 5. 实施顺序

```text
Wave 1 (parallel — 拆分 port.ts 所有权后):
  Plan R1  assistantHtml.ts + tests + stripHtml 扩展 + card.css
           + completeResultToHtml 委托（R1 可改 port.ts 渲染函数；不改 ChatPort 接口）
  Plan R2  ChatExplain* 类型 + ChatPort.explain?（R2 独占 port.ts 接口区）
           + mock/openai explain + explainSpan + tests
           （若并行冲突：R2 先合接口 10 行，R1 再改 completeResultToHtml）

Wave 2 (after R2; R1 建议已合以便真 MD 验收，但不阻塞解释):
  Plan R3  TermFloat state（span/status）+ InquiryCard mark→explainSpan
  Plan R4  SelectionBar 解释 + 互斥 + quote 小收齐(P1 可同 plan 末)
           依赖 R2+R3；不依赖 R1

Wave 3 (docs / polish):
  Plan R5  AGENTS + **必改**对象模型下划线手势一句 + 可选共识学习回路一句 + 手测 / vitest
```

| 阶段 | 任务 | 依赖 | 工作量 |
|------|------|------|--------|
| R1 | 安全子集 HTML | — | **M** |
| R2 | explain port + explainSpan | — | S–M |
| R3 | TermFloat + mark 流程 | R2（R1 建议并行合入） | M |
| R4 | SelectionBar 解释 | R2, R3 | S |
| R5 | 文档与验收 | R3, R4 | S |

**外部协调：** 与 dual-track（同改 `chatActions` / `openaiCompat` / `port` signal）rebase 时保 explain 入口与 `completeResultToHtml` XSS 不变量。

---

## 6. 验收标准

### 6.1 富文本

- [ ] 回复中的 `**粗体**`、无序列表、简单标题、行内 code、代码围栏在卡内有对应结构样式  
- [ ] `completeResultToHtml({ text: "<script>alert(1)</script>" })` 不含可执行标签  
- [ ] mark 术语仍带 `class="mark"` 且可点击  
- [ ] fence 内同名 term **无** `.mark`  
- [ ] `stripHtml` 后回灌不含原始标签残留；列表有换行分隔  
- [ ] `npm test` 覆盖 assistantHtml 关键用例  

### 6.2 短解释

- [ ] mock 下点 mark：浮层 loading→ready，正文含 mock 固定前缀（如 `（MockExplain）`），且不等于已删除的 `termExplanation` 死表路径  
- [ ] 划词解释：`SourceSpan.text` / explain 入参为选区全文，不为 UI 截断标题  
- [ ] 解释失败可重试；深挖/发散在 error 态仍可点  
- [ ] 解释 **不** 增加 nodes/turns 数量  
- [ ] 关闭浮层后迟到的 explain 响应不写回已关实例（seq）  
- [ ] 无 universe 时（demo）解释仍可用  

### 6.3 手势

- [ ] 点 mark **不会**自动建卡  
- [ ] 深挖/发散仍建正确 kind 边 + SourceSpan（text=`span`）  
- [ ] 划词「解释」打开同一套浮层  
- [ ] 划词「预览」仍进 DirectionChooser  
- [ ] 引用仍写入 composer quote chip（全文 span）  

### 6.4 非目标抽检

- [ ] 无批注图层 / 无注释线程 UI  
- [ ] 无第三种 EdgeKind  
- [ ] overlay 组件无直接 fetch  

### 6.5 回归

- [ ] `npm test` 全绿  
- [ ] `npm run build`（tsc + vite）通过  
- [ ] 手动：demo 卡点 mark → 解释 → 深挖；划词解释；发送含列表的 mock 回复（可改 mock 夹具）  

---

## 7. 不在范围

- MiniMax / 文档式 **批注、注释锚点、气泡线程**  
- 卡片变为 **可编辑 Markdown 笔记**  
- 解释结果 **持久化** 为 Turn / db / Obsidian  
- 点 mark **静默深挖** 或默认建卡  
- 同 span **复用已有子卡**（另案）  
- Agent 工具循环自动 spawn  
- 外链预览、图片附件、GFM 表格（可后置）  
- **KaTeX / 数学公式：** 已开做 — 见 `docs/superpowers/specs/2026-08-20-math-katex-spec.md`（SSoT）；本 Spec 不再 defer  
- 新 npm markdown 重型依赖（P0 禁止；**定向豁免仅 `katex`**，见 math-katex-spec §2.1；不引入 remark/rehype/mathjax）  
- 设置壳 / FocusOrbit / PathLineNav 本波改动  
- 技能市场、代码插件  

---

## 8. 风险

| 风险 | 缓解 |
|------|------|
| md 子集拆坏 mark 标签 | 单测锁定；格式化跳过 mark / code 内部 |
| explain 延迟/费用 | 短 prompt；截断；mock 可测；cache 同 span |
| 与未提交 orbit / dual-track 冲突 | 文件白名单；explain 独立入口；rebase 保 XSS |
| 用户以为解释=建卡 | 文案 + 不自动 spawn |
| XSS 回归 | 只白名单标签；先 escape |
| selection 截断污染 SourceSpan | float.`span` 全文锁定 |

---

## 9. 版本变更

| 版本 | 说明 |
|------|------|
| v1.0 | 初稿：富文本子集 + 真解释 + 划词解释；拒批注 |
| v1.1 | Oracle：float.span 锁定；R1/R2 port 所有权；explain 单入口；MD 顺序/code 区；对象模型必改；dual-track 协调；MockExplain 前缀验收 |
