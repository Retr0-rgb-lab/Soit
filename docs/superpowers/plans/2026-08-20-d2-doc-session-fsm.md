# Plan D2: DocSession FSM + types + formatDocAnchorQuote

> **For agentic workers:** pure FE lib; Wave 1 parallel with D1; no store/UI  
> **Spec:** v1.1 §2.3  
> **工作目录:** `E:\学习软件\Soit`

---

### Task 2.1: types SourceSpan optional doc fields

**Files:**
- Modify: `src/types.ts`

- [ ] Add to `SourceSpan`: `docPath?`, `docPage?`, `docKind?`

### Task 2.2: docSession reducer

**Files:**
- Create: `src/lib/docSession.ts`
- Create: `src/lib/docSession.test.ts`

- [ ] Implement types + `initialDocSession()` + `reduceDocSession(state, event)`
- [ ] Cover: open→loading; load_ok/err epoch guard; retry; layout; force_close; open cancels prior epoch
- [ ] `npm test -- src/lib/docSession.test.ts`

### Task 2.3: formatDocAnchorQuote

**Files:**
- Modify: `src/lib/composerPayload.ts`
- Modify: `src/lib/composerPayload.test.ts`

- [ ] Export `DocAnchor` + `formatDocAnchorQuote`
- [ ] Test formatting with/without page
- [ ] Commit:
```bash
git add src/types.ts src/lib/docSession.ts src/lib/docSession.test.ts src/lib/composerPayload.ts src/lib/composerPayload.test.ts
git commit -m "feat(fe): DocSession FSM and doc anchor quote helper (PEL-156 D2)"
```

---

## Acceptance

- [ ] docSession tests green  
- [ ] composerPayload tests green  
- [ ] No workspaceStore / AppShell edits  
- [ ] 1 commit  
