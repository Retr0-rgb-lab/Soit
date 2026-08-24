# Plan C: ChatPort + MockChat + BYOK stub

> **For agentic workers:** After Wave 1 merge; `(plan-c)`; Diff Report.  
> **Spec:** v1.1 §Wave C  
> **Depends:** B (spawn/scope)  
> **Wave:** 2

## 0. Mission

Real send path via `ChatPort.complete`; MockChat first with structured marks; OpenAI-compatible BYOK config path; regenerate uses same port; no new nodes on regenerate.

## 1. File ownership

| Path | Action |
|------|--------|
| `src/lib/chat/port.ts` | **new** interface |
| `src/lib/chat/mockChat.ts` | **new** |
| `src/lib/chat/openaiCompat.ts` | **new** BYOK fetch |
| `src/lib/chat/*.test.ts` | mock tests |
| `src/lib/host.ts` | get/set provider config invokes if rust; else localStorage mock |
| `src/state/workspaceStore.ts` | appendUserMessage async via port; regenerateTurn via port |
| `src/components/card/Composer.tsx` | config empty state; remove fake permanent demo badge |
| `src-tauri/src/chat_config.rs` | **new** optional: read/write config path (not secrets in db) |
| `src-tauri/src/lib.rs` | minimal config commands |
| permissions + capabilities | as needed |

**Forbidden:** Obsidian precipitate (D), skills body (E may inject later), map polish.

## 2. Design

```ts
interface ChatPort {
  complete(input: {
    cardId: string;
    messages: { role: "user"|"assistant"|"system"; content: string }[];
    scope?: unknown;
  }): Promise<{ text: string; marks?: { term: string; explanation?: string }[] }>;
}
```

- Default MockChat when no API key
- Key: `app_config` dir or env; never commit; never store in universe.db plaintext
- Marks → wrap terms in `<span class="mark" data-term="...">`

## 3. Acceptance

- [ ] Mock send produces assistant turn with mark HTML
- [ ] regenerate mutates turn only
- [ ] npm test + build; cargo test if rust

## 4. Diff Report `"plan":"C"`
