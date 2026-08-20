# Plan R2: ChatPort.explain + explainSpan

> **For agentic workers:** Wave 1；独占 ChatPort 接口区与 mock/openai explain；不改 UI overlays  
> **Spec:** `docs/superpowers/specs/2026-08-20-card-read-explain-spec.md` §2.2  
> **工作目录:** `E:\学习软件\Soit`  
> **Owns:** `port.ts` 接口类型区, `mockChat.ts`, `openaiCompat.ts`, `explainActions.ts` 或 `chatActions.ts` 仅 explainSpan, `explain.test.ts`  
> **Do not touch:** assistantHtml 管线主体（若 R1 未合，只在 port 加类型，不重写 completeResultToHtml）, TermFloat, SelectionBar, InquiryCard, FocusOrbit*

---

### Task R2.1: Types + Mock/OpenAI explain

**Files:**
- Modify: `src/lib/chat/port.ts` — add `ChatExplainInput`, `explain?` on `ChatPort` only (do not rewrite HTML pipeline if R1 owns it)
- Modify: `src/lib/chat/mockChat.ts`
- Modify: `src/lib/chat/openaiCompat.ts`
- Modify: `src/lib/chat/index.ts` — export new types
- Create: `src/lib/chat/explain.test.ts`

- [ ] **Step 1:** Add interfaces per spec §2.2
- [ ] **Step 2:** `MockChat.explain` returns text starting with `（MockExplain）` + span context; delay optional short
- [ ] **Step 3:** `OpenAICompatChat.explain` — short system prompt, temp ~0.3, span slice 500, result slice 800; pass `signal` to fetch if present
- [ ] **Step 4:** Test mock explain prefix
- [ ] **Step 5:** `npm test -- src/lib/chat`
- [ ] **Step 6: Commit**
```bash
git add src/lib/chat/port.ts src/lib/chat/mockChat.ts src/lib/chat/openaiCompat.ts src/lib/chat/index.ts src/lib/chat/explain.test.ts
git commit -m "feat(chat): ChatPort.explain with MockExplain prefix"
```

---

### Task R2.2: `explainSpan` single entry

**Files:**
- Create: `src/state/explainActions.ts` (prefer separate file to reduce dual-track conflict with chatActions)
- Modify: export from store barrel if needed (`workspaceStore` re-export or direct import from card)

- [ ] **Step 1:** Implement:
```ts
export async function explainSpan(opts: {
  cardId: string;
  span: string;
  contextMessages?: ChatMessage[];
  signal?: AbortSignal;
}): Promise<string>
```
  - resolve port same way as complete (read existing `resolvePort` / getChatPort pattern in chatActions)
  - if `port.explain` use it; else fallback complete with strong system
  - return plain text string; throw on failure
- [ ] **Step 2:** Unit test with mock port if easy; else rely on explain.test.ts
- [ ] **Step 3: Commit**
```bash
git add src/state/explainActions.ts
git commit -m "feat(state): explainSpan single entry for short explain"
```

---

## Acceptance

- [ ] Mock explain text includes `（MockExplain）`
- [ ] UI still unchanged (no TermFloat wiring yet)
- [ ] No overlay network
- [ ] 2 commits
