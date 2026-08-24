# Plan A4: runCompletion + cancel + inflight

> **For agentic workers:** `src/state/*` + `src/lib/chat/*` only; no UI shell  
> **Spec:** v1.1 §2.1–2.2  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** 2 · depends A2 systemPrompt  
> **冲突:** 勿改 runtimeActions / Settings

---

### Task 4.1: ChatPort signal

**Files:**
- Modify: `src/lib/chat/port.ts` — `signal?: AbortSignal` on input
- Modify: `src/lib/chat/openaiCompat.ts` — pass to fetch; use systemPrompt
- Modify: `src/lib/chat/mockChat.ts` — respect abort (short pollable delay ~30–50ms loops up to ~400ms total optional)
- Modify: tests

---

### Task 4.2: runCompletion

**Create:** `src/state/runCompletion.ts`

```ts
export async function runCompletion(args: {
  get, set,
  cardId, turnId, messages, scope, gen, signal
}): Promise<void>
```

- withSkillsSystem → resolvePort → complete
- if aborted / gen mismatch → return
- empty text → `（模型返回为空）`
- completeResultToHtml → update_turn or patchTurnAi
- on error: write short error html if still current

---

### Task 4.3: chatActions refactor

**Modify:** `src/state/chatActions.ts`, `workspaceStore.ts`

- Add `inquiryInflight` state + `cancelInflight`
- appendUserMessage / regenerateTurn set inflight with AbortController, call runCompletion, clear matching gen in finally
- stop using think `#gen` as sole race token (think can still say `生成中…`)
- Keep universe append_turn ordering

**Tests:** extend `workspaceStore.test.ts`:
- cancel prevents late write (mock port delayed)
- regenerate no new nodes
- empty reply text becomes 非空 html

```bash
npx vitest run src/state src/lib/chat
git commit -m "feat(chat): shared runCompletion with cancel and inflight"
```

---

## Acceptance

- [ ] No duplicated complete bodies in chatActions
- [ ] cancel + empty text tests pass
- [ ] files ≤800 LOC
