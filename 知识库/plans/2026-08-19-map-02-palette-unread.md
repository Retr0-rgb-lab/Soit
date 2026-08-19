# Plan 02: CommandPalette rank + LeftRail unread cap

> **For agentic workers:** shell lists only; depends on paletteRank from Plan 01  
> **Spec:** v1.1 §2.5–2.6  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** 1-B (after 01 or same wave if 01 merged)

---

### Task 2.1: CommandPalette
**Files:** Modify `src/components/shell/CommandPalette.tsx`

- [ ] Use `rankPaletteNodes` from `src/lib/paletteRank.ts`
- [ ] Empty query: recent → unread → ancestors, not full dump
- [ ] Cap results; footnote for remainder

### Task 2.2: LeftRail unread
**Files:** Modify `src/components/shell/LeftRail.tsx`

- [ ] Cap unread list at 12 + 「还有 k 条未读」
- [ ] Do NOT add DEV stress menu

### Task 2.3: Commit
```bash
git add src/components/shell/CommandPalette.tsx src/components/shell/LeftRail.tsx
git commit -m "feat(shell): palette ranking cap and unread rail limit"
```

## Acceptance
- [ ] Empty palette does not list all nodes when many exist
- [ ] Unread list capped
