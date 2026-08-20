# Plan R3: TermFloat + mark → explainSpan

> **For agentic workers:** Wave 2；依赖 R2（explainSpan）；R1 建议已合  
> **Spec:** `docs/superpowers/specs/2026-08-20-card-read-explain-spec.md` §2.3  
> **工作目录:** `E:\学习软件\Soit`  
> **Owns:** `TermFloat.tsx`, `InquiryCard.tsx` (mark/float/seq only), `marks.ts`  
> **Do not touch:** SelectionBar 解释按钮（R4）, assistantHtml, FocusOrbit*, Settings*

---

### Task R3.1: TermFloat loading/error/retry UI

**Files:**
- Modify: `src/components/overlays/TermFloat.tsx`
- Modify: `src/components/overlays/overlays.css` if needed

- [ ] **Step 1:** Extend props/state:
  - `term`, `span`, `body`, `status: loading|ready|error`, `error?`, `source`, coords
  - `onRetry`, `onDeepen`, `onDiverge`, `onClose` — deepen/diverge pass **span** via parent (parent already has float.span)
- [ ] **Step 2:** UI for loading / ready / error+retry; footer: 短解释不建卡
- [ ] **Step 3: Commit**
```bash
git add src/components/overlays/TermFloat.tsx src/components/overlays/overlays.css
git commit -m "feat(overlays): TermFloat loading error retry for explain"
```

---

### Task R3.2: InquiryCard mark → explainSpan + seq

**Files:**
- Modify: `src/components/card/InquiryCard.tsx`
- Modify: `src/lib/marks.ts` — remove termExplanation dead table; keep isMarkElement/markTermFrom

- [ ] **Step 1:** Float state includes `span`, `status`, `turnId`, `markId`, seq ref
- [ ] **Step 2:** On mark click: close selbar; open float loading with span=term; call `explainSpan`; on success if seq match set ready; on fail error
- [ ] **Step 3:** Deepen/diverge use `float.span` for SourceSpan.text (not truncated term)
- [ ] **Step 4:** Close float bumps seq; never auto-spawn on open
- [ ] **Step 5:** Remove `termExplanation` import/usage
- [ ] **Step 6:** `npm test` + smoke typecheck if possible
- [ ] **Step 7: Commit**
```bash
git add src/components/card/InquiryCard.tsx src/lib/marks.ts
git commit -m "feat(card): mark click opens live explain without spawn"
```

---

## Acceptance

- [ ] Mark click does not create nodes
- [ ] Mock path shows `（MockExplain）` in float (manual or component test)
- [ ] Spawn still explicit via deepen/diverge with full span
- [ ] 2 commits
