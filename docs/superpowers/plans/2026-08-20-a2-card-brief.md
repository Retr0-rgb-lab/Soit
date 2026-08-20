# Plan A2: cardBrief + systemPrompt

> **For agentic workers:** pure lib + tests; do not modify chatActions/store  
> **Spec:** v1.1 §2.2–2.3 §2.9  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** 1

---

### Task 2.1: systemPrompt

**Files:**
- Create: `src/lib/chat/systemPrompt.ts`
- Modify: `src/lib/chat/index.ts` (export)
- Modify: `src/lib/chat/openaiCompat.ts` (use it; keep behavior)

```ts
// systemPrompt.ts
export function buildInquirySystemPrompt(scope?: unknown): string {
  const bits = [
    "You are Soit, an inquiry-workspace assistant. Reply in the user's language.",
    "Be concise. When introducing technical terms worth forking, wrap each once as [[term]].",
  ];
  if (scope != null) {
    bits.push(`Deepen scope (JSON): ${JSON.stringify(scope).slice(0, 2000)}`);
  }
  return bits.join("\n");
}
```

- [ ] Wire openaiCompat to use `buildInquirySystemPrompt`
- [ ] Commit: `feat(chat): extract inquiry system prompt builder`

---

### Task 2.2: cardBrief

**Files:**
- Create: `src/lib/cardBrief.ts`
- Create: `src/lib/cardBrief.test.ts`
- Modify: `src/lib/AGENTS.md` (one line if not done in A1)

Implement per Spec §2.3:
- `BRIEF_MESSAGE_CAP = 16`
- `buildCardBrief`, `cardBriefToMarkdown`, `parseAssistantImport` → re-export `parseAssistantContent`
- instructions 中文固定契约字符串
- deepen via existing `inboundEdge` + parent node fields only

**Test fixtures must include parent card with unique turn text that must NOT appear in brief.**

```bash
npx vitest run src/lib/cardBrief.test.ts
git add src/lib/cardBrief.ts src/lib/cardBrief.test.ts src/lib/chat/systemPrompt.ts src/lib/chat/openaiCompat.ts src/lib/chat/index.ts
git commit -m "feat(lib): card brief builder and system prompt"
```

---

## Acceptance

- [ ] vitest cardBrief passes（含父 turn 不泄漏）
- [ ] openaiCompat 仍可 complete（现有 mockChat tests 过）
- [ ] 生产文件 ≤800 LOC
