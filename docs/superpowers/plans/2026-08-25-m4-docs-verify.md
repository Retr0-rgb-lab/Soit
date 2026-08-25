# Plan M4: 文档 / AGENTS / skill 同步 + 全量 verify

> **For agentic workers:** 只碰文档 + skill 文件 + 全量验证命令。0.3d。串行于 Wave 2。
> **Spec:** `docs/superpowers/specs/2026-08-25-mcp-read-ergonomics-spec.md` §2.6 + §6
> **工作目录:** `/home/peleclic/workspace/soit`
> **Wave:** 3(依赖 M3)

---

### Task 4.1: AGENTS 契约

**Files:**
- Modify: `src-tauri/AGENTS.md`

- [ ] **Step 1:** 在命令表后或 MCP 相关段落(当前无 MCP 段则新增)加:

```markdown
## MCP(soit mcp serve)

- 只读 stdio;5 工具:list_cards / read_card / list_turns / read_turn / search_cards
- `list_turns`/`read_turn`/`read_card` 支持 `render=text|markdown|html`(默认 text)
- 转换器 `src-tauri/src/mcp/clean.rs`:仅 `ai_html` 走转换;`think`/`process` 是 raw 文本原样输出
- 实体解码顺序 `&amp;` 必须最后;`data-tex` / mermaid textContent 输出前须 `html_unescape`
- `list_turns` 分页 `{total, offset, limit, turns}`;limit clamp 1..100;read_card 无分页
- `list_cards` 每卡带 `turnCount`/`updatedAt`/`sizeHint`;`search_cards` 支持 `searchTurns`/`limit`
- DTO 时间戳:`InquiryNodeDto.created_at/updated_at`、`TurnDto.created_at`(camelCase → createdAt/updatedAt)
```

### Task 4.2: writeNotes skill 同步

**Files:**
- Modify: `~/.agents/skills/soit-writeNotes/SKILL.md`(不在仓库,独立提交不适用)

- [ ] **Step 2:** §2 读取对话整段改为:

```markdown
### 2. 读取对话
- `soit_list_cards` 枚举卡片(每卡自带 `turnCount`/`updatedAt`/`sizeHint`,按 updatedAt 排序优先处理最新卡;sizeHint 大的巨卡走分页)。
- 对范围内每张卡:`soit_list_turns cardId=X render=text`(**默认即 text,无需任何客户端 html2text**)。
  - 返回 `{total, offset, limit, turns}`;`total > limit` 时按 offset 翻页直到读完。
  - 单 turn 补读用 `soit_read_turn cardId=X turnId=Y render=text`。
- 不要用 `render=html`(含 KaTeX SVG 噪音);不要派 subagent 逐段读大 JSON;`aiText` 已是干净文本(LaTeX 原样、表格 pipe、代码 fence)。
- 需要卡片状态时用 `soit_read_card cardId=X render=text`。
- **完成判据**:范围内所有 turns 读完并提取,无遗漏卡片。
```

### Task 4.3: 全量 verify

- [ ] **Step 3:**
```bash
cd /home/peleclic/workspace/soit/src-tauri && cargo test 2>&1 | tail -12
cd /home/peleclic/workspace/soit && npm test 2>&1 | tail -6
npm run build 2>&1 | tail -8
```

- [ ] **Step 4: commit(仓库内文档)**
```bash
cd /home/peleclic/workspace/soit
git add src-tauri/AGENTS.md
git commit -m "docs(agents): MCP read ergonomics contract (render/pagination/meta)"
```

---

## Acceptance

- [ ] `cargo test` / `npm test` / `npm run build` 全绿
- [ ] `src-tauri/AGENTS.md` 含 MCP 契约段
- [ ] `~/.agents/skills/soit-writeNotes/SKILL.md` 不再含「派并行 subagent」「html2text」字样
- [ ] 1 个 commit(仓库内)
