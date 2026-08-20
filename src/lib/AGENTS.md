# src/lib/ — host bridge and pure helpers

No React components here. Keep functions pure and unit-tested where logic is non-trivial.

Parent: `src/AGENTS.md`.

**Agent dual-track** (spec v1.1): main track = Inquiry Chat (`chat/`); side track = External Runtime bridge + `cardBrief` (handoff brief, not card source). Full contract: `docs/superpowers/specs/2026-08-20-agent-dual-track-spec.md`. Card truth stays `universe.db`; runs sandbox is `vault/.soit/runs/` only.

## Modules

| File | Responsibility |
|------|----------------|
| `host.ts` | Only bridge to Tauri commands; **mock** when `window` has no Tauri internals |
| `demoSeed.ts` / `stressSeed.ts` | In-memory snapshots for browser/dev and stress |
| `graphLayout.ts` | Node positions for graph SVG |
| `mapScope.ts` | Map LOD scopes (`cone` / `working` / `atlas` / `growth`), roles, caps |
| `liveSet.ts` | Live-thread pin set + session touch |
| `treeNav.ts` / `threadDebt.ts` | Tree ancestry / root / subtree helpers |
| `deepenScope.ts` | Deepen parent/edge scope for chat complete (v2: parent fields, no parent turns) |
| `cardBrief.ts` | Pure card brief builder / markdown / import parse (Spec §2.3; no parent transcript) |
| `paletteRank.ts` | Command-palette ranking |
| `marks.ts` | Mark DOM helpers for assistant HTML (no static term-explanation dictionary) |
| `chat/` | ChatPort + MockChat + OpenAI-compat BYOK + config + systemPrompt + `assistantHtml` / `explain` (Inquiry main track) |
| `runtime/` | RuntimeId/info/prefs types + localStorage prefs mirror — spec §2.5; host wrappers in `host.ts` |

## Rules

- `host.ts` command surface (match Rust names + `types.ts`):
  - bootstrap / universe: `get_bootstrap_state`, `get_workspace_snapshot`, `open_universe`, `close_universe`, `create_root_inquiry`, `select_vault` (compat), `spawn_inquiry`
  - turns/cards (Spec §5): `append_turn`, `update_turn`, `delete_turn`, `update_card` — camelCase invoke args
  - vault MD: `precipitate_concept`, `append_residue`
  - skills: `list_skills`, `set_skill_enabled`, `get_enabled_skills_text`
  - BYOK: `get_chat_config` / `set_chat_config` (app config / localStorage — never `universe.db`)
  - Runtime (dual-track): `list_runtimes` / `get_runtime_prefs` / `set_runtime_prefs` / `start_runtime_handoff` / `cancel_runtime_handoff` — app config + `vault/.soit/runs/`; never treat external session as universe source; browser mock-only
- Chat secrets: app config / localStorage only — never `universe.db`.
- **`renderAssistantHtml`** (`chat/assistantHtml.ts`): safe subset pipeline order — **escapeHtml → code protect → wrapMarks → md-subset** (paragraphs/lists/headings/bold/code). Whitelist tags only from the pipeline; **never trust model HTML**. `completeResultToHtml` delegates here.
- **`ChatPort.explain?` / `explainSpan`** (`state/explainActions.ts`): short 2–4 sentence explain; **no marks required, no db/turns write, no spawn**. UI sole entry is `explainSpan` (resolves port); overlays must not call `port.explain` or `fetch`.
- **Deepen scope v2** (`deepenScope.ts`): `{ parent: { title, status, question, stuck, next }, span, why, recentTurns }` — **child turns only**; never parent transcript.
- **Load matrix** (`App.tsx`): only inject `demoSnapshot()` when `source === "demo"`. Never when `empty` or `universe`.
- Browser path (no Tauri): mock bootstrap + demo snapshot; turn/card host helpers throw (store must not call them off universe path).
- Prefer pure input→output helpers; side effects only in `host.ts` (dynamic `import("@tauri-apps/api/core")`).
- Co-locate `*.test.ts` next to the module; keep Vitest env `node` unless a test truly needs DOM.

## Do not

- Put Zustand or JSX here.
- Expand host surface without updating `src-tauri` commands **and** capabilities/permissions together (G1 owns Rust handlers).
- Fall back to demo after a vault is bound.
