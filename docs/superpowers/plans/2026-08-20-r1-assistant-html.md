# Plan R1: 安全子集 assistant HTML

> **For agentic workers:** Wave 1；不改 ChatPort 接口；不碰 overlays/InquiryCard 解释流  
> **Spec:** `docs/superpowers/specs/2026-08-20-card-read-explain-spec.md` §2.1  
> **工作目录:** `E:\学习软件\Soit`  
> **Owns:** `src/lib/chat/assistantHtml.ts`, `assistantHtml.test.ts`, `port.ts`（仅 `completeResultToHtml`/`stripHtml`/`applyMarksHtml` 拆分）, `index.ts` 导出渲染, `card.css` `.ai-html`  
> **Do not touch:** TermFloat, SelectionBar, chatActions explain, mockChat.explain, FocusOrbit*, Settings*

---

### Task R1.1: `renderAssistantHtml` + tests

**Files:**
- Create: `src/lib/chat/assistantHtml.ts`
- Create: `src/lib/chat/assistantHtml.test.ts`
- Modify: `src/lib/chat/port.ts` (render path only)
- Modify: `src/lib/chat/index.ts`

- [ ] **Step 1:** Implement pipeline A→D per spec:
  - `escapeHtml` once
  - fence + inline code protect
  - `wrapMarksOnEscaped(escaped, marks)` — extract wrap logic from `applyMarksHtml` without double-escape
  - paragraphs, br, headings, ul, strong/em
  - never split mark tags; no marks inside code/pre
- [ ] **Step 2:** `completeResultToHtml` delegates to `renderAssistantHtml`
- [ ] **Step 3:** Extend `stripHtml` for `</li>`, `</h1-3>`, `</pre>`
- [ ] **Step 4:** Tests — XSS script; `**x**`; list; fence; `**term**`+marks; fence term no mark
- [ ] **Step 5:** Run `npm test -- src/lib/chat`
- [ ] **Step 6: Commit**
```bash
git add src/lib/chat/assistantHtml.ts src/lib/chat/assistantHtml.test.ts src/lib/chat/port.ts src/lib/chat/index.ts
git commit -m "feat(chat): safe markdown subset for assistant HTML"
```

---

### Task R1.2: Card CSS for structured AI HTML

**Files:**
- Modify: `src/components/card/card.css`

- [ ] **Step 1:** Style `.ai-html p, ul, ol, li, pre, code, h1, h2, h3` — compact paper feel, no huge headings
- [ ] **Step 2: Commit**
```bash
git add src/components/card/card.css
git commit -m "style(card): typography for structured assistant HTML"
```

---

## Acceptance

- [ ] `npm test` green for assistantHtml + existing mockChat HTML tests
- [ ] No new npm dependencies
- [ ] `completeResultToHtml` still escapes raw HTML
- [ ] 2 commits
