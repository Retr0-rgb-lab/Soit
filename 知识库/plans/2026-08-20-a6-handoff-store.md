# Plan A6: runtimeActions + store surface + brief import/export

> **For agentic workers:** state layer; depends A4+A5  
> **Spec:** v1.1 §2.4 §2.6 §2.8  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** 3

---

### Task 6.1: runtimeActions

**Create:** `src/state/runtimeActions.ts`

Implement:
- `exportCardBrief(cardId?)` — buildCardBrief from store + optional skills text
- `importAssistantToFocus(raw, opts?)` — append_turn user `（导入自外部 Agent）` + update aiHtml escaped
- `startRuntimeHandoff({ cardId?, runtimeId? })`:
  1. reject if inquiryInflight or runtimeRun staging/running
  2. build brief; append_turn user `（交给本地 Agent：{name}）`
  3. set runtimeRun running; call host `startRuntimeHandoff` with cardId+runtimeId (+ brief md optional)
  4. on result update_turn; clear runtimeRun terminal status
  5. never spawn_inquiry
- `cancelRuntimeHandoff` → host cancel + mark turn cancelled if still current
- `refreshRuntimes` / `loadRuntimePrefs` / `setRuntimePrefs`

**Modify:** `workspaceStore.ts` — wire surface fields from Spec §2.8

**Tests:** `workspaceStore.test.ts`
- mock handoff +1 turn, nodes unchanged
- import creates turn with escaped html
- mutual exclusion with inflight if easy

```bash
npx vitest run src/state
git commit -m "feat(state): runtime handoff and card brief import/export"
```

---

## Acceptance

- [ ] Mock handoff demo path works in tests
- [ ] No new graph nodes on handoff
- [ ] ≤800 LOC per file
