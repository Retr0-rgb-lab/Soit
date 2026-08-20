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
| `docSession.ts` | Pure DocSession FSM (`reduceDocSession` / `initialDocSession`) — PEL-156; no IO |
| `splitRatio.ts` | Doc/card `--doc-fraction` clamp/read/write (`soit-doc-split-ratio`) + `sanitizeMaterialFileName`; never universe.db |
| `materialsRail.ts` | Pure materials-rail helpers (list status / reduce) when present — store owns open/import busy |
| `composerPayload.ts` | Composer body builder + **`formatDocAnchorQuote`** (doc selection → single quote string) |
| `paletteRank.ts` | Command-palette ranking |
| `marks.ts` | Mark DOM helpers for assistant HTML (no static term-explanation dictionary) |
| `chat/` | ChatPort + MockChat + OpenAI-compat BYOK + config + **`modelSettings`** + systemPrompt + `assistantHtml` / `explain` (Inquiry main track) |
| `chat/modelSettings.ts` | `ModelSettings` v1 types, migrate flat `ChatConfig`, `resolveChatConfig` / `activeModelLabel`, LS read/write + legacy key migrate |
| `math/tex.ts` | Shared KaTeX protect/render (`protectAndRenderMath`) for assistant + doc md; same PH alphabet as code slots; fallback `<code class="soit-math-fallback">` |
| `runtime/` | RuntimeId/info/prefs types + localStorage prefs mirror — spec §2.5; host wrappers in `host.ts` |
| `sessionConfig.ts` | SessionConfig v1 normalize/migrate/push/remove recentVaults (≤8); LS `soit-session`; Host authority via `host.ts` — hall preselect only; **no** cold-start auto-open |

## Rules

- `host.ts` command surface (match Rust names + `types.ts`):
  - bootstrap / universe: `get_bootstrap_state`, `get_workspace_snapshot`, `open_universe`, `close_universe`, `create_root_inquiry`, `select_vault` (compat), `spawn_inquiry`
  - turns/cards (Spec §5): `append_turn`, `update_turn`, `delete_turn`, `update_card` — camelCase invoke args
  - vault MD: `precipitate_concept`, `append_residue`
  - vault docs (PEL-156): `resolve_vault_doc` / `read_vault_text` — path sandbox under open vault; reject `..` / outside vault / `vault/.soit/**`; browser mock fixtures `demo/*.md` (e.g. `demo/welcome.md`)
  - materials (materials-rail SPE): `list_vault_materials` / `import_vault_material` — vault `materials/` only; import ≤2MB decoded; **not** bootstrap; browser mock list includes `demo/welcome.md` + in-memory imports
  - skills: `list_skills`, `set_skill_enabled`, `get_enabled_skills_text`
  - BYOK multi-provider: `get_model_settings` / `set_model_settings` (authoritative `ModelSettings`); `get_chat_config` / `set_chat_config` (project active → flat `ChatConfig` / legacy upsert); app config JSON / localStorage — **never** `universe.db`
  - Runtime (dual-track): `list_runtimes` / `get_runtime_prefs` / `set_runtime_prefs` / `start_runtime_handoff` / `cancel_runtime_handoff` — app config + `vault/.soit/runs/`; never treat external session as universe source; browser mock-only
  - Session: `get_session_config` / `set_session_config` / `get_last_vault` / `set_last_vault` — app config `soit-session.json` (browser LS `soit-session`); open success Host writes last+recent; set last null keeps recents; `close_universe` does **not** clear last/recents
- **Workspace hall / session** (spec `docs/superpowers/specs/2026-08-20-workspace-hall-spec.md`):
  - Cold start: FE reads `getSessionConfig` for last+recents + `getBootstrapState` only to detect Host-bound vault → `closeUniverse`; **never** auto `openUniverse(lastVault)`
  - Enter is user-driven (`spaceNav` / store); Host canonical path is authority after open ok
  - Browser: no fake bound vault; open fails; no “演示宇宙” enter CTA in v1
- **ModelSettings contract** (`chat/modelSettings.ts`; Rust mirror `src-tauri/src/chat_config.rs`):
  - Shape: `{ version:1, providers[], models[], activeModelId }` — provider = name + baseUrl + apiKey; model = providerId + modelId + optional label + enabled
  - Migrate: legacy flat `ChatConfig` with non-empty key → 1 provider + 1 model + active; empty key → empty catalog
  - Resolve: active → provider credentials for Port; no active / disabled / empty key → Mock (`apiKey: ""`)
  - Normalize drops orphan models (unknown providerId) and invalid active; write path mirrors projected `ChatConfig` for legacy readers
  - Cold start: bootstrap **must not** read model settings or hit model network
  - Spec: `docs/superpowers/specs/2026-08-20-model-providers-spec.md`
- **DocSession FSM** (`docSession.ts`): statuses `closed|loading|ready|error|closing`; events include `open` / `load_ok|load_err` / `set_layout` / `retry` / `close|closed` / **`force_close`** (map + `loadSnapshot` — skip anim, bump epoch). Store owns IO + epoch guards (`state/workspaceStore.ts`); this module stays pure.
- **SplitRatio** (`splitRatio.ts`): `--doc-fraction` ∈ [0.28, 0.72], default 0.42, wide display 0.68; localStorage only. UI host is `components/shell/SplitSash.tsx`.
- **`formatDocAnchorQuote`** (`composerPayload.ts`): `{ path, text, page? }` → `（path [p.N]）\ntext` single quote string for composer; no multi-chip `docQuotes[]` in v1.
- Chat secrets: app config / localStorage only — never `universe.db`; UI lists show 已配置/未配置 only, never plaintext keys.
- **`renderAssistantHtml`** (`chat/assistantHtml.ts`): safe subset pipeline order — **escapeHtml → code protect → math (`protectAndRenderMath`) → wrapMarks → md-subset** (paragraphs/lists/headings/bold/code). Whitelist tags only from the pipeline; **never trust model HTML**. `completeResultToHtml` delegates here. Math SSoT: `docs/superpowers/specs/2026-08-20-math-katex-spec.md` (bundled `katex` only; no CDN).
- **`protectAndRenderMath`** (`math/tex.ts`): runs on already-escaped text after code PH; `$…$` inline / `$$…$$` block; tex body `htmlUnescape` then KaTeX; display PH on its own line for `PH_ONLY`; `stripHtml` restores `$`/`$$` via `data-tex`. Doc preview reuses the same helper (`MdTextView` / `renderDocMd`).
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
- Share DocSession reducer with CardPip FSM; no `data:`/`blob:` PDF read helpers in P0.
