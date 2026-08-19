# src/ — frontend

Vite + React 18 + TypeScript UI. Desktop host is Tauri; browser `npm run dev` uses mock host.

Project-wide constraints: root `AGENTS.md`. Product rules: `知识库/AGENTS.md`.

## Layout

| Path | Role |
|------|------|
| `main.tsx` | Mount + import global CSS only |
| `App.tsx` | First paint `AppShell`, then async bootstrap/snapshot in `useEffect` |
| `types.ts` | Shared DTO shapes (`InquiryNode`, `Turn`, snapshots) |
| `components/shell/` | Three-pane chrome + map |
| `components/card/` | Focused inquiry card |
| `components/overlays/` | Floating UI over card/selection |
| `lib/` | Host bridge + pure helpers |
| `state/` | Zustand workspace store |
| `styles/` | Design tokens + app chrome CSS |

## Rules

- **First paint before IO:** render shell immediately; never block mount on vault/DB/network (`App.tsx`).
- **Host boundary:** all Tauri `invoke` goes through `lib/host.ts`. UI must not import `@tauri-apps/*` elsewhere.
- **Load matrix:** `demo` may use frontend seed; `empty`/`universe` never silent-demo. Empty vault → `EmptyWorkspace` CTA.
- **No CDN fonts/CSS** in this tree. Stack is system UI (`styles/tokens.css` `--font`).
- Visual tokens live in `styles/tokens.css`; component CSS stays next to its folder (`card.css`, `overlays.css`, shell styles in `app.css` as established).
- Prefer warm paper UI language already in tokens — do not restyle toward Explore pastel clones.
- Co-locate unit tests as `*.test.ts` under the module; run via root `npm test` (Vitest, `src/**/*.{test,spec}.{ts,tsx}`).

## Nested

| Read | When |
|------|------|
| `state/AGENTS.md` | Store API, caps, spawn/regenerate semantics |
| `lib/AGENTS.md` | Host mock, map/graph pure logic, seeds |
| `components/shell/AGENTS.md` | Shell / map chrome |
| `components/card/AGENTS.md` | Card / turns / composer |
| `components/overlays/AGENTS.md` | Floats and selection chrome |
