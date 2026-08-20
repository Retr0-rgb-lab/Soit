# Plan R4: SelectionBar 解释 + quote 收齐

> **For agentic workers:** Wave 2 after R3；共享 InquiryCard  
> **Spec:** `docs/superpowers/specs/2026-08-20-card-read-explain-spec.md` §2.4–2.5  
> **工作目录:** `E:\学习软件\Soit`  
> **Owns:** `SelectionBar.tsx`, `InquiryCard.tsx` (selection→explain + float quote), `icons.tsx` if needed  
> **Do not touch:** port pipeline, FocusOrbit*, Settings*

---

### Task R4.1: SelectionBar explain button

**Files:**
- Modify: `src/components/overlays/SelectionBar.tsx`
- Modify: `src/components/card/icons.tsx` (optional IconExplain)
- Modify: `src/components/card/InquiryCard.tsx`

- [ ] **Step 1:** Add 解释 button + `onExplain` prop; tip「短解释（不建卡）」
- [ ] **Step 2:** InquiryCard: onExplain → close selbar → open TermFloat with:
  - span = full selection text
  - term = slice(0,24) + … if longer
  - turnId from selbar
  - source selection
  - then explainSpan
- [ ] **Step 3:** Mutual exclusion mark ↔ selection ↔ float
- [ ] **Step 4: Commit**
```bash
git add src/components/overlays/SelectionBar.tsx src/components/card/InquiryCard.tsx src/components/card/icons.tsx
git commit -m "feat(card): selection bar short explain entry"
```

---

### Task R4.2: TermFloat quote (P1)

**Files:**
- Modify: `TermFloat.tsx`, `InquiryCard.tsx`

- [ ] **Step 1:** Quote button sets composer quote chip from **float.span** (reuse existing quote state path)
- [ ] **Step 2:** Focus composer if helper exists
- [ ] **Step 3: Commit**
```bash
git add src/components/overlays/TermFloat.tsx src/components/card/InquiryCard.tsx
git commit -m "feat(card): quote span from explain float into composer"
```

---

## Acceptance

- [ ] Selection explain uses full span for explain + later deepen SourceSpan
- [ ] Preview/quote/copy still work
- [ ] Quote from float uses span not truncated term
- [ ] 2 commits
