# Plan 04: Inquiry Card + Overlays

> **For agentic workers:** Do NOT modify `src/state/**`, `graphLayout.ts`, `LeftRail.tsx`, `RightGraph.tsx` except reading store API.  
> **Spec:** v1.1 §2.3–2.4, W2-B  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** 2 · **Depends:** Plan 02 · **Parallel with:** Plan 03

**Goal:** 中区探究卡完整交互：轮次、卡头、卡缘深挖/发散、作曲条、标注浮层、轮次 hover 条、划词条（可简化）。

## Global Constraints

- 只写 `src/components/card/**`, `src/components/overlays/**`, `src/lib/marks.ts`；`App.tsx` 仅挂载 `<InquiryCard />`
- 消费 store：`focusId`, `nodes`, `turnsByCardId`, `spawnDeepen`, `spawnDiverge`, `regenerateTurn`, `deleteTurn`, `toggleTurnCollapsed`, `appendUserMessage`
- 深挖/发散 only；重生不建卡
- 无 CDN 字体
- 划词可简化但必须有可点 UI

---

### Task 1: Card chrome + composer + turns

**Files:**
- Create: all under `src/components/card/`

**Interfaces:**
- Consumes store hook from Plan 02/03

- [ ] **Step 1: InquiryCard 结构**

```tsx
// layout
// CardHeader: path kicker, title from focused node, buttons deepen / bookmark(ui) / delete(noop tip)
// TurnList / TurnItem: collapsed row click -> toggleTurnCollapsed
// messages: user bubble, think toggle, aiHtml with dangerouslySetInnerHTML only for trusted demo HTML
// EdgeActions: deepen + diverge below card
// Composer: textarea, Ctrl+Enter -> appendUserMessage, Enter newline
```

- [ ] **Step 2: 轮次 hover 条**  
  CSS opacity 过渡（非 display:none 硬切）；按钮：深挖、发散、收藏(ui)、重生、删轮。

- [ ] **Step 3: 手动验证** `npm run dev`  
  发送消息出现新轮；重生改 ai 文本；删轮（至少 2 轮时）。

- [ ] **Step 4: Commit**

```bash
git add src/components/card
git commit -m "feat: inquiry card turns, edge actions, composer"
```

---

### Task 2: Marks, float, selection bar

**Files:**
- Create: `src/lib/marks.ts`, `src/components/overlays/*`

- [ ] **Step 1: 标注**  
  aiHtml 内 `.mark[data-term]`：click → TermFloat（解释文案可用静态 map）；浮层按钮 spawnDeepen/spawnDiverge(term)。

- [ ] **Step 2: DirectionChooser**  
  可选：浮层已含二按钮则可合并。

- [ ] **Step 3: SelectionBar 简化**  
  mouseup 在 `.ai-html` 选区 → 固定条：预览(打开 chooser/float)、引用(写入 composer quote chip)、复制(navigator.clipboard)。

- [ ] **Step 4: Tooltip**  
  `data-tip` + delay ~400ms；fixed 层。

- [ ] **Step 5: Commit**

```bash
git add src/components/overlays src/lib/marks.ts src/components/card
git commit -m "feat: term float, selection bar, tooltips on inquiry card"
```

---

## Acceptance

- [ ] 无 vault demo 下可完成：深挖/发散/标注分叉/发送
- [ ] 重生不增加节点（依赖 store）
- [ ] 未修改 store 签名
- [ ] ≥1 commit
