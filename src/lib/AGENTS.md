# src/lib/ — host bridge and pure helpers

No React components here. Keep functions pure and unit-tested where logic is non-trivial.

Parent: `src/AGENTS.md`.

## Modules

| File | Responsibility |
|------|----------------|
| `host.ts` | Only bridge to Tauri commands; **mock** when `window` has no Tauri internals |
| `demoSeed.ts` / `stressSeed.ts` | In-memory snapshots for browser/dev and stress |
| `graphLayout.ts` | Node positions for graph SVG |
| `mapScope.ts` | Map LOD scopes (`cone` / `working` / `atlas` / `growth`), roles, caps |
| `liveSet.ts` | Live-thread pin set + session touch |
| `treeNav.ts` / `threadDebt.ts` | Tree ancestry / root / subtree helpers |
| `paletteRank.ts` | Command-palette ranking |
| `marks.ts` | Mark / term helpers for assistant HTML |
| `chat/` | ChatPort + MockChat + OpenAI-compat BYOK + config |

## Rules

- `host.ts` commands: `get_bootstrap_state`, `get_workspace_snapshot`, `open_universe`, `close_universe`, `create_root_inquiry`, `select_vault` (compat), `get_chat_config` / `set_chat_config` (BYOK). Match Rust names and TS types in `types.ts`.
- Chat secrets: app config / localStorage only — never `universe.db`.
- **Load matrix** (`App.tsx`): only inject `demoSnapshot()` when `source === "demo"`. Never when `empty` or `universe`.
- Browser path (no Tauri): mock bootstrap + demo snapshot.
- Prefer pure input→output helpers; side effects only in `host.ts` (dynamic `import("@tauri-apps/api/core")`).
- Co-locate `*.test.ts` next to the module; keep Vitest env `node` unless a test truly needs DOM.

## Do not

- Put Zustand or JSX here.
- Expand host surface without updating `src-tauri` commands **and** capabilities/permissions together.
- Fall back to demo after a vault is bound.
