# MCP 读取人体工学(干净文本 / 分页 / 元数据)— Spec v1.1

> 日期: 2026-08-25
> 依据: `src-tauri/src/mcp/`(245a359, P0 只读 stdio MCP);真实蒸馏工作流反馈(傅里叶卡 14 turn 裸输出 ~794KB,上下文爆掉、子代理卡死);`~/.agents/skills/soit-writeNotes/SKILL.md`(被迫派并行 subagent + 客户端 html2text 兜底);`知识库/docs/共识.md` §6.1
> 基线分支: `main`(HEAD = fff0b18 区域,含 245a359)
> 前置依赖: MCP P0(245a359);`renderAssistantHtml` / `protectAndRenderMath`(data-tex);`renderAssistantHtml` 输出标签集封闭

---

## 摘要

MCP `list_turns` / `read_card` 把 DB 里的 `ai_html`(前端渲染后的完整 HTML,含 KaTeX SVG path)整包序列化给 LLM,大卡单次输出可达数百 KB,截断上下文、卡死子代理。本 Spec 在 **MCP 序列化层** 加 `render=text|markdown|html`(默认 text)、分页、默认精简噪音字段、`list_cards` 元数据(turnCount/updatedAt/sizeHint)、`search_cards` 搜 turn 正文。**不动 DB schema、不动前端渲染链、不加双写字段** —— 转换靠自有封闭标签白名单 + `data-tex` 无损还原 LaTeX。预期 payload 缩减 ~8–10×,writeNotes 工作流从「派 subagent + 写 Python 兜底」降级为「单次调用直接读」。

## 0. 前置依赖

| 已有 | 路径 |
|------|------|
| MCP stdio server | `src-tauri/src/mcp/{mod,tools,jsonrpc}.rs`;`soit mcp serve --vault <path>` |
| 只读快照 | `Universe::snapshot()` 每次 call 全量重建;`turns_by_card_id: BTreeMap<String, Vec<TurnDto>>` |
| KaTeX 还原锚点 | `src/lib/math/tex.ts:57/61` — `.soit-math[-block|-inline]` 外壳带 `data-tex="原始LaTeX"` |
| mark 锚点 | `.mark[data-term][data-mark-id]` |
| mermaid 占位 | `<div class="soit-mermaid">ESCAPED_SOURCE</div>`(textContent = 源码) |
| 表结构 | `cards` 有 `created_at`/`updated_at`;`turns` 有 `created_at`(snapshot SELECT **未取**) |
| FE 镜像 | `src/types.ts` `InquiryNode` / `Turn`(加字段向后兼容) |

## 1. 现状

### 1.1 痛点链(实测)

1. `tools.rs::turn_value()` 直接 `serde_json::to_value(TurnDto)` → `ai_html` 含 `renderAssistantHtml` 全量输出:KaTeX `renderToString` 的 SVG path、MathML 外壳、嵌套 span。傅里叶卡 14 turn ≈ 794KB。
2. `list_turns` / `read_card` 无分页、无字段筛选:一次调用必然全量。
3. `list_cards` 只有 node 字段(id/title/kind/parentId/unread/status/question/stuck/next),无 turnCount/updatedAt/sizeHint —— 蒸馏工作流无法定位「哪张卡最新、哪张是巨无霸」。
4. `search_cards` 只搜 title/question/stuck/next,不搜 turn 正文 —— 库变大后不可用。
5. `think` + `process[]` 与正文一起全量输出;detail 常与 think 重复,对蒸馏是噪音。
6. `call_tool` 每次全量 `snapshot()`:连 `list_cards` 都背着全部 turns(性能隐患,P0 接受,P1 再改按需查询)。

### 1.2 代码锚点

| 文件 | 行/区域 | 现状 |
|------|---------|------|
| `src-tauri/src/mcp/tools.rs` | `turn_value`/`list_turns`/`read_card`/`list_cards`/`search_cards` | 全量序列化;无参数化 |
| `src-tauri/src/universe/snapshot.rs` | cards SELECT(:39)、turns SELECT(:68) | 未取 `created_at`/`updated_at` |
| `src-tauri/src/universe/dto.rs` | `InquiryNodeDto`(:8)/`TurnDto`(:25) | 无时间戳字段 |
| `src/types.ts` | `InquiryNode`(:8)/`Turn`(:42) | 同上 |
| `src/lib/chat/assistantHtml.ts` | 渲染管道 | 输出即 DB `ai_html`(UI 权威,不动) |

## 2. 需要做的工作

### 2.1 转换器 `src-tauri/src/mcp/clean.rs`(P0,新文件)

`fn ai_html_to_clean(html: &str, mode: TextMode) -> String`,mode ∈ `Text | Markdown`。

**白名单标签语义**(自家渲染管道输出的封闭集合;手写逐字符扫描器,不用 regex/quick-xml,~120 行):

| 输入 | Text | Markdown |
|------|------|----------|
| `p` / `br` | 换行 | 换行 |
| `h1..h3`(管道实际只产 h1-h3;h4-h6 预留同规则) | 空行 + 文本 | `#`…`###` |
| `ul`/`ol`/`li` | `- item` | `- item` / `1. item` |
| `strong`/`b` | 原文 | `**x**` |
| `em`/`i` | 原文 | `*x*` |
| 行内 `code` | 原文 | `` `x` `` |
| `pre`(非 mermaid) | 原文块 | ```` ``` ```` fence(语言探测省略) |
| `pre`/`div.soit-mermaid` | 源码块 | ```` ```mermaid ```` fence |
| `blockquote` | `> ` 行 | `> ` 行 |
| `table` | pipe 表(`\|a\|b\|` + 分隔行) | 同左 |
| `.mark[data-term]` | textContent | textContent |
| `.soit-math*[data-tex]` | `$tex$` / `$$tex$$` | 同左 |
| `.katex-html` / `svg` / `.katex-mathml` / MathML | **丢弃** | **丢弃** |
| `span.ai-link`(assistantHtml.ts:79) | label 文本 | label 文本 |
| `code.soit-math-fallback`(KaTeX 失败兜底,tex.ts:64) | tex 原文 | `` `tex` `` |
| `div.ai-table-wrap`(assistantHtml.ts:213) | 透传子 table | 同左 |
| 未知标签 | textContent(不递归,含 htmlUnescape) | 同左 |

规则:

- HTML 实体解码按 `tex.rs::htmlUnescape` 顺序:`&lt;` → `&gt;` → `&quot;` → `&#39;` → **最后 `&amp;`**(及 `&#NNN;`)。`&amp;` 必须最后,否则 `&amp;lt;`(原文 `&lt;` 的转义)会被双重解码成 `<`。
- `data-tex` 属性值是 `attrEscape` 之后的(tex.ts:42-51),读取后须 `htmlUnescape` 还原;`data-tex` 缺失的 `.soit-math` → 丢弃整块(不吐 SVG 噪音)。
- `.soit-mermaid` 与 `<pre><code>` 的 textContent 是 `escapeHtml` 之后的(assistantHtml.ts:21-45),必须 `htmlUnescape` 还原源码后再输出;fence 内不再二次转义。
- 输出逐行 trim 空白行合并(连续空行 → 一个)。
- **不** 处理:图片、link、script/style(渲染管道不产出;遇到直接丢弃内容)。
- 单测 ≥ 20 条:math 还原、svg 丢弃、mark、table、mermaid、实体、嵌套、fence、blockquote、未知标签。

### 2.2 IPC DTO 加时间戳(P0)

| 文件 | 变更 |
|------|------|
| `src-tauri/src/universe/dto.rs` | `InquiryNodeDto` + `created_at: String, updated_at: String`;`TurnDto` + `created_at: String`(均 camelCase 输出 `createdAt`/`updatedAt`) |
| `src-tauri/src/universe/snapshot.rs` | cards SELECT 加 `created_at, updated_at`;turns SELECT 加 `created_at`(排序保持 `sort_order, created_at, id`) |
| `src/types.ts` | `InquiryNode` + `createdAt?: string; updatedAt?: string`;`Turn` + `createdAt?: string` |

向后兼容:FE 对未知字段忽略;demo seed 无此字段(optional)。`src-tauri/src/lib.rs` 若有 `InquiryNodeDto` 字面量构造(非 snapshot 路径)需同步补字段 —— 执行时 grep 全部构造点。

### 2.3 MCP 工具参数化(P0)

**breaking change(P0 上线 <1 周,唯一消费者 soit-writeNotes skill 为文本描述,无代码依赖):** `list_turns` 返回 shape 从裸 array 改为分页对象。

```jsonc
// list_turns
{ "cardId": "...", "render": "text", "offset": 0, "limit": 50,
  "includeThink": false, "includeProcess": false }
// → { "total": 14, "offset": 0, "limit": 50, "turns": [...] }

// read_turn / read_card
{ "cardId": "...", "turnId": "...", "render": "text" }
// read_card 内嵌 turns 跟随 render;单 turn 默认全量(think/process 都给)
// read_card 无分页:render=text 内嵌全部 turns 预期 ≤100KB;更大卡必须走 list_turns 分页
```

| 参数 | 默认 | 规则 |
|------|------|------|
| `render` | `"text"` | `text`→字段 `aiText`;`markdown`→`aiMarkdown`;`html`→`aiHtml`(原样) |
| `offset`/`limit` | 0 / 50 | limit clamp 1..100;offset 越界 → 空 turns + total |
| `includeThink`/`includeProcess` | false | `list_turns` 默认 drop;`read_turn` 忽略此参数(全量) |

**仅 `ai_html` 走 `ai_html_to_clean`。** `think` 与 `process[].detail` 在 DB 里是 raw 纯文本/markdown(think 由 `mutations.rs:293-295` 原样写入,detail 是 tool content JSON 或 think 文本,非 HTML)—— **原样输出**,不经过 HTML 扫描器。`render=html` 行为与今日完全一致。

`tool_definitions()` 的 inputSchema 同步扩展 render/offset/limit/includeThink/includeProcess 参数。

### 2.4 list_cards 元数据(P0)

每卡附加(不额外查询,从同一次 snapshot 计算):

```jsonc
{
  "...现有字段...": "...",
  "turnCount": 14,                 // turns_by_card_id 长度
  "updatedAt": "2026-08-25T…",     // card.updated_at
  "sizeHint": 812345               // Σ(ai_html.len + user.len + think.len) 字节(String::len()=UTF-8 字节,非 token/字数)
}
```

### 2.5 search_cards 搜 turn 正文(P0)

参数加 `searchTurns: bool = true`、`limit: u32 = 20`(clamp 1..50)。

- 卡级 hay 不变(title/question/stuck/next)。
- `searchTurns=true`:对每卡 turns,`user` 原文 + `ai_html` 经 `ai_html_to_clean(Text)` 后做大小写不敏感子串匹配。
- 命中卡输出加 `"matchedIn": "title|question|stuck|next|turns"` + `"matchSnippet": "…80字…"`(turn 命中时取命中点周围文本)。

### 2.6 文档与 skill 同步(P1)

| 文件 | 变更 |
|------|------|
| `src-tauri/AGENTS.md` | MCP 段:render/分页/元数据契约 + 转换器白名单一句 |
| `docs/superpowers/specs/2026-08-20-agent-dual-track-spec.md` | 无需(MCP 不是主轨工具) |
| `~/.agents/skills/soit-writeNotes/SKILL.md` | §2 读取对话:删除「大对话必须派并行 subagent」与「aiHtml→干净 md」客户端转换;改为 `soit_list_turns cardId=X render=text`(分页翻完)+ `read_turn` 兜底;保留「提炼清单」输出要求 |

## 3. 文件变更清单

| 文件 | 变更 | 节 |
|------|------|-----|
| `src-tauri/src/mcp/clean.rs` | **新建** 转换器 + 单测 | 2.1 |
| `src-tauri/src/mcp/tools.rs` | render/分页/字段精简/元数据/searchTurns | 2.3 2.4 2.5 |
| `src-tauri/src/mcp/mod.rs` | P1 加 `mod clean;` 声明;P3 若 arg 解析复用需小改 | 2.1 2.3 |
| `src-tauri/src/universe/dto.rs` | 时间戳字段 | 2.2 |
| `src-tauri/src/universe/snapshot.rs` | SELECT 扩展 | 2.2 |
| `src/types.ts` | FE 镜像 optional 字段 | 2.2 |
| `src-tauri/AGENTS.md` | MCP 契约 | 2.6 |
| `~/.agents/skills/soit-writeNotes/SKILL.md` | 去 subagent 流程 | 2.6 |

**不改:** `assistantHtml.ts` / `tex.ts` / DB schema / `SCHEMA_VERSION` / 前端渲染路径 / 其他 IPC command。

## 4. 架构图

```text
DB turns.ai_html (渲染后 HTML + KaTeX SVG)
        │
        ▼
Universe::snapshot() ──► TurnDto { ai_html, think, process, created_at }
        │                        │
        │  call_tool(name, args, universe)
        │                        │
        │        ┌───────────────┴───────────────┐
        │        ▼                               ▼
        │  list_turns/read_turn/read_card    list_cards(富化)
        │        │                               │
        │        ▼                               │
        │  render=text|markdown|html             │
        │        │                               │
        │        ▼                               │
        └──► mcp::clean::ai_html_to_clean ──► { aiText|aiMarkdown|aiHtml }
                 (白名单 + data-tex → LaTeX)

search_cards: hay(card) + hay(clean(turn.user + turn.ai_html)) → matchedIn + snippet
```

## 5. 实施顺序

| Wave | Plan | 内容 | 依赖 | 工作量 |
|------|------|------|------|--------|
| 0 | — | 本 spec + oracle review → v1.1 | — | — |
| 1(并行) | P1 `clean.rs` 转换器 | 2.1 全部 + 单测 | — | 0.5d |
| 1(并行) | P2 DTO 时间戳 | 2.2 全部 + cargo 测 | — | 0.3d |
| 2 | P3 tools 参数化 | 2.3 2.4 2.5 + MCP 测试更新 | P1+P2 | 0.6d |
| 3 | P4 文档 + skill + verify | 2.6 + cargo test / npm test / npm run build | P3 | 0.3d |

P1(新文件)与 P2(dto/snapshot/types)文件不相交 → 并行。P3 独占 `tools.rs`/`mod.rs`。P4 文档与 AGENTS。

## 6. 验收标准

- [ ] `render=text` 输出中**无** `svg`、`katex`、`katex-mathml`、`<` 实体残留(转换器单测覆盖)
- [ ] `data-tex` 原样还原为 `$…$` / `$$…$$`;多公式/嵌套块无损
- [ ] 794KB 量级卡(14 turn 含大量公式)`list_turns render=text` 输出 ≤ 100KB 且内容完整(公式数、列表数可对账)
- [ ] `render=html` 输出与旧版逐字节一致(除新增 `createdAt` 字段)
- [ ] `list_turns` 分页:offset 0 limit 5 → 5 turns + total 14;offset 12 limit 5 → 2 turns;offset 越界 → 空 + total
- [ ] `list_turns` 默认输出无 `think`/`process` 字段;`includeThink=true` 才出现
- [ ] `read_turn` 默认含 think/process 全量
- [ ] `list_cards` 每卡有 `turnCount`/`updatedAt`/`sizeHint`,数值与 DB 一致
- [ ] `search_cards searchTurns=true` 能命中只出现在 turn 正文的词,返回 snippet;`searchTurns=false` 不搜 turns
- [ ] `search_cards limit` 生效且 clamp
- [ ] mermaid 源码以 ` ```mermaid ` fence 输出
- [ ] `cd src-tauri && cargo test`(含 mcp 全部单测)绿
- [ ] `npm test` / `npm run build` 绿(FE 镜像字段不影响现有测试)
- [ ] `soit-writeNotes/SKILL.md` 不再要求 subagent / 客户端 html2text
- [ ] 冷启动不受影响(MCP 仅 `soit mcp serve` 子命令;bootstrap 不触达)

## 7. 不在范围

- DB schema 变更 / ai_html 双写 markdown 源 / SCHEMA_VERSION bump
- `snapshot()` 按需化(list_cards 不全量读 turns)—— P1 单独 spec
- FTS5 全文索引(P0 LIKE/内存搜;P1 再议)
- MCP 写工具(保持只读)
- 前端 UI 的 aiHtml 消费路径任何改动
- `process` 字段结构重构(仅输出层筛选)
- export_card_markdown 独立工具(`render=markdown` 已覆盖)
- 其他 IPC command 的 DTO 变更(仅 InquiryNodeDto/TurnDto 加时间戳)

## 8. 风险

| 风险 | 缓解 |
|------|------|
| 转换器丢内容(未知标签/嵌套) | 白名单 + 单测 ≥20;未知标签 textContent 兜底,宁可多字不可丢字 |
| `data-tex` 老数据缺失(旧版渲染) | 缺失时丢整块,spec 明确此行为 |
| DTO 加字段破坏 FE | 全部 optional;npm test 回归 |
| breaking shape 影响既有消费者 | P0 上线 <1 周,唯一消费者是 skill 文本;spec 明示 breaking |
| snapshot 全量重建性能 | P0 接受;list_cards 的富化是 O(turns) 内存计算,不额外 IO |

## 9. 版本变更

| 版本 | 说明 |
|------|------|
| v1.0 | 初稿:转换器、分页、元数据、searchTurns、skill 同步 |
| v1.1 | Oracle REVISE → 修正:实体解码顺序(&amp; 最后)、mermaid/fence textContent 须 htmlUnescape、data-tex 须还原、think/process 是 raw 文本不走转换器、白名单补 ai-link/soit-math-fallback/ai-table-wrap、h1-h3 实况、read_card 无分页边界声明、inputSchema 同步、mod.rs 归属 P1 |
