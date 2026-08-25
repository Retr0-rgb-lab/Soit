# Plan M3: MCP 工具参数化(render / 分页 / 元数据 / searchTurns)

> **For agentic workers:** 独占 `src-tauri/src/mcp/tools.rs`(+ 测试),依赖 M1 `clean.rs` 与 M2 DTO 字段。0.6d。串行于 Wave 1。
> **Spec:** `docs/superpowers/specs/2026-08-25-mcp-read-ergonomics-spec.md` §2.3 / 2.4 / 2.5
> **工作目录:** `/home/peleclic/workspace/soit`
> **Wave:** 2(依赖 M1 + M2 已 commit)

---

### Task 3.1: 参数解析 + turn 输出构造

**Files:**
- Modify: `src-tauri/src/mcp/tools.rs`

- [ ] **Step 1: 先读现状 + M1 产物**
```bash
sed -n '1,130p' src-tauri/src/mcp/tools.rs
sed -n '1,60p' src-tauri/src/mcp/clean.rs   # M1 的 API 签名
```

- [ ] **Step 2: 加解析 helper 与 turn 构造**

```rust
use crate::mcp::clean::{ai_html_to_clean, TextMode};

fn arg_bool(args: Option<&Value>, key: &str, default: bool) -> bool {
  args.and_then(Value::as_object).and_then(|o| o.get(key))
    .and_then(Value::as_bool).unwrap_or(default)
}
fn arg_u64(args: Option<&Value>, key: &str, default: u64, clamp_max: u64) -> u64 {
  args.and_then(Value::as_object).and_then(|o| o.get(key))
    .and_then(Value::as_u64).unwrap_or(default).min(clamp_max)
}
fn arg_render(args: Option<&Value>) -> &'static str {
  // "html" → html; "markdown" → markdown; 其他/缺省 → text
}

/// turn → MCP value;render 决定 ai 字段名与内容;include_* 控制 think/process 是否出现。
fn turn_mcp_value(turn: &TurnDto, render: &str, include_think: bool, include_process: bool) -> Value {
  // text  → "aiText": ai_html_to_clean(&turn.ai_html, TextMode::Text)
  // markdown → "aiMarkdown": ai_html_to_clean(..., Markdown)
  // html  → "aiHtml": turn.ai_html 原样(与旧版一致)
  // think / process:raw 原样输出(不走转换器),仅当 include_* 为 true 时插入
  // createdAt 直接透传(turn.created_at)
}
```

- [ ] **Step 3: 更新 tool_definitions inputSchema**(5 个工具全部按 spec §2.3/2.5 补参数描述与类型)

### Task 3.2: list_turns / read_turn / read_card

- [ ] **Step 4: list_turns 分页 shape(breaking)**

```rust
// 返回 {"total": N, "offset": o, "limit": l, "turns": [...]}
// offset 越界 → 空 turns + total;limit clamp 1..100
// 默认 render=text, includeThink=false, includeProcess=false
```

- [ ] **Step 5: read_turn / read_card**

```rust
// read_turn(cardId, turnId, render="text"): 单 turn 默认全量(think/process 都给)
// read_card(cardId, render="text"): 内嵌 turns 跟随 render;无分页(边界见 spec §2.3)
```

### Task 3.3: list_cards 元数据 + search_cards turns

- [ ] **Step 6: list_cards 富化**

```rust
// 每卡附加(turnCount, updatedAt=node.updated_at, sizeHint)
// sizeHint = Σ over turns of (ai_html.len() + user.len() + think.len()) 字节
```

- [ ] **Step 7: search_cards searchTurns + limit**

```rust
// 参数: query(必填), searchTurns=true, limit=20(clamp 1..50)
// 卡级 hay: title/question/stuck/next(现状)
// turn 级 hay: user 原文 + ai_html_to_clean(ai_html, Text)
// 命中卡附加: "matchedIn": "title|question|stuck|next|turns", "matchSnippet": 命中点 ±40 字
// 输出条目同样带 list_cards 的元数据(turnCount 等)
```

### Task 3.4: 测试更新 + 验收

- [ ] **Step 8: 更新 `tools.rs` 测试与 `mod.rs` 测试**(shape 变了)

```bash
cd /home/peleclic/workspace/soit/src-tauri && cargo test mcp 2>&1 | tail -40
```

必补测例:`list_turns` 分页(total/offset/limit、越界)、默认无 think/process、`includeThink=true` 出现、`render=html` 与旧输出一致(除 createdAt)、`list_cards` 三字段存在、`search_cards` turn 命中带 snippet、`searchTurns=false` 不搜 turns、limit clamp、`read_turn` 默认全量。

- [ ] **Step 9: commit**
```bash
cd /home/peleclic/workspace/soit
git add src-tauri/src/mcp/tools.rs src-tauri/src/mcp/mod.rs
git commit -m "feat(mcp): render/pagination/metadata/searchTurns for read tools"
```

---

## Acceptance

- [ ] `cargo test` 全绿(含 M1 M2 测试)
- [ ] `render=text` 输出无 `svg`/`katex` 子串;`render=html` 与旧版一致(除新增 createdAt 字段)
- [ ] 分页:offset 0 limit 5 → 5 turns + total 14;越界 → 空 + total
- [ ] 默认输出无 `think`/`process`;`read_turn` 全量
- [ ] `list_cards` 有 `turnCount`/`updatedAt`/`sizeHint`;`search_cards` turn 命中带 snippet
- [ ] `cargo test mcp` 新增 ≥10 条断言
- [ ] 1 个 commit
