# Plan M2: splitRatio + filename sanitize helpers

> **For agentic workers:** Wave 1 parallel M1; pure FE  
> **Spec:** v1.1 §2.6  
> **工作目录:** `E:\学习软件\Soit-wt-model-providers`

---

### Task 2.1

**Create:** `src/lib/splitRatio.ts` + `splitRatio.test.ts`

- [ ] `DOC_FRACTION_MIN=0.28` `MAX=0.72` `DEFAULT=0.42` `DOC_WIDE_FRACTION=0.68`
- [ ] `clampDocFraction`, `readStoredDocFraction`, `writeStoredDocFraction` (key `soit-doc-split-ratio`)
- [ ] Optional: `sanitizeMaterialFileName(name: string): string` in same or `materialName.ts`

- [ ] `npm test` for these files
- [ ] Commit: `feat(fe): doc split ratio helpers (M2)`

## Acceptance
- [ ] No AppShell/store edits
- [ ] 1 commit
