# src/state/ — workspace store

Zustand store is the **UI source of truth** for the open card universe. Demo/browser stays memory-only; when `source === "universe"`, durable graph **and turn** mutations go through Host.

Parent: `src/AGENTS.md`. Domain invariants: `知识库/docs/对象模型.md`.
Spec: `知识库/specs/2026-08-20-host-hardening-and-durability.md` §6.

**Agent dual-track** (spec v1.1 `docs/superpowers/specs/2026-08-20-agent-dual-track-spec.md`): Inquiry completion via shared `runCompletion` + `inquiryInflight` cancel; Runtime handoff via `runtimeRun` + brief export/import — external sessions are **not** card sources.

## Layout

| File | Role |
|------|------|
| `workspaceStore.ts` | Thin Zustand surface: load/focus/spawn/map + re-exports |
| `turnHelpers.ts` | ids, resolveTurnCard, messagesFromTurns, patchTurnAi, skills inject |
| `spawnMerge.ts` | memorySpawn, mergeHostSnapshot, afterFocus, hostClearUnread |
| `chatActions.ts` | append / regenerate / delete / collapse (demo memory + universe write-through) |
| `runCompletion.ts` | *(planned)* shared Inquiry complete pipeline + abort — spec §2.1 |
| `workspaceStore.test.ts` | Mutation semantics + universe mock host |

## Rules

- Public mutation surface lives on `WorkspaceState` in `workspaceStore.ts` (`loadSnapshot`, `focusNode`, `setWorkspaceMode` / map scope, `spawnInquiry`, turn ops, live pin, re-entry dismiss). Prefer extending these over ad-hoc parallel stores.
- **Unified spawn:** `spawnInquiry({ kind, source, … })`. `spawnDeepen` / `spawnDiverge` are thin wrappers.
- **Fork kinds only:** `deepen` | `diverge`. Never introduce a third node kind for “regenerate” or “merge”.
- **`regenerateTurn`:** rewrite the current turn in place; **must not** add a graph node.
- **Universe path** (`source === "universe"` — do **not** gate on vaultPath):
  - `appendUserMessage` → Host `append_turn` → chat complete → `update_turn` (aiHtml)
  - `regenerateTurn` → complete → `update_turn` only (no nodes)
  - `deleteTurn` / `toggleTurnCollapsed` → Host `delete_turn` / `update_turn`
  - `focusNode` / `markThreadRead` unread clear → `update_card` unread=false (fire-and-forget)
  - `spawnInquiry` → Host only; on failure log + `""` — **never** `memorySpawnInquiry`
- **Demo / unbound** (`source === "demo"` etc.): memory spawn + local turns.
- **`mergeHostSnapshot`:** full replace OK after write-through (turns already on Host).
- **`bootEpoch` / `beginBootLoad`:** App/openUniverse should bump epoch and pass it to `loadSnapshot(snap, epoch)` so stale loads do not clobber (Spec §6.3). Wire in App when coordinating G3.
- **Turn ops** scoped by `(cardId, turnId)`. Prefer passing `cardId`; without it, resolve under `focusId` then scan.
- Skills text injected via `getEnabledSkillsText` at complete time (`turnHelpers.withSkillsSystem`).
- **Dual-track store surface** *(planned)*: `inquiryInflight` / `cancelInflight`; `exportCardBrief` / `importAssistantToFocus`; `runtimeRun` + start/cancel handoff — Composer locks when inquiry or runtime inflight (spec §2.1–2.6).
- Caps are intentional product knobs — keep consistent with map/rail consumers:
  - `LIVE_MAX` (`lib/liveSet.ts`)
  - `UNREAD_RAIL_CAP`
  - map caps in `lib/mapScope.ts` (`DEFAULT_MAP_CAPS`, etc.)
- `loadSnapshot` replaces graph/turns/focus from host/demo; preserve re-entry hint behavior already in the store.
- Production files in this folder **≤800 LOC** each.
- Tests: `workspaceStore.test.ts` — extend when mutation semantics change.

## Do not

- Call `@tauri-apps/*` directly from the store — only dynamic-import `lib/host` for durable mutations.
- Fall back to memory spawn after a failed universe `spawn_inquiry`.
- FE-only success path for universe turns (no ghost append without Host ack).
- Mirror full chat transcripts into Obsidian from here (not in scope; see non-goals).
