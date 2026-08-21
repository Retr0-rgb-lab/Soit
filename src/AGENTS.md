# src/ — frontend

Vite + React 18 + TypeScript UI. Desktop host is Tauri; browser `npm run dev` uses mock host.

Project-wide constraints: root `AGENTS.md`. Product rules: `知识库/AGENTS.md`.

## Layout

| Path | Role |
|------|------|
| `main.tsx` | Mount + import global CSS only |
| `App.tsx` | Cold start: default `shellPhase=picker` → `WorkspacePicker` first; boot closes Host-bound vault if any, loads session (last+recents), **never** silent `openUniverse(lastVault)` |
| `types.ts` | Shared DTO shapes (`InquiryNode`, `Turn`, snapshots) |
| `components/shell/` | Hall (`WorkspacePicker`) + three-pane chrome + map |
| `components/card/` | Focused inquiry card |
| `components/overlays/` | Floating UI over card/selection |
| `lib/` | Host bridge + pure helpers |
| `state/` | Zustand workspace store (`shellPhase` + space nav) |
| `styles/` | Design tokens + app chrome CSS |

## Rules

- **Hall before workspace:** store default `shellPhase = "picker"`. First paint is the vault hall, not `AppShell`. User must **enter** a path before any `open_universe`.
- **`shellPhase`** (orthogonal to `workspaceMode` focus/map): `picker` \| `entering` \| `workspace` \| `leaving` \| `error`. Mount: hall phases → `WorkspacePicker`; `workspace`/`leaving` → `AppShell`. Actions: `enter` / `leave` / `switchVault` / `forgetRecent` via `state/spaceNav.ts` + navEpoch (`beginBootLoad`).
- **First paint before IO:** never block mount on vault/DB/network (`App.tsx`). Boot may `closeUniverse` if Host already bound, then stay on hall.
- **Host boundary:** all Tauri `invoke` goes through `lib/host.ts`. UI must not import `@tauri-apps/*` elsewhere.
- **Load matrix:** product hall/unbound uses empty nodes (no demo-card flood, no fake vault rows, no demo-enter CTA). Bound empty vault → `EmptyWorkspace` CTA. `demoSnapshot()` is unit-tests only — never product boot/enter.
- **No CDN fonts/CSS** in this tree. Stack is system UI (`styles/tokens.css` `--font`).
- Visual tokens live in `styles/tokens.css`; component CSS stays next to its folder (`card.css`, `overlays.css`, shell styles in `app.css` as established).
- Prefer warm paper UI language already in tokens — do not restyle toward Explore pastel clones.
- Co-locate unit tests as `*.test.ts` under the module; run via root `npm test` (Vitest, `src/**/*.{test,spec}.{ts,tsx}`).

## Nested

| Read | When |
|------|------|
| `state/AGENTS.md` | Store API, caps, spawn/regenerate semantics |
| `lib/AGENTS.md` | Host mock, map/graph pure logic, seeds |
| `components/shell/AGENTS.md` | Shell / map chrome · **global orbit on app bg, never over card** |
| `components/card/AGENTS.md` | Card / turns / composer |
| `components/overlays/AGENTS.md` | Floats and selection chrome |
