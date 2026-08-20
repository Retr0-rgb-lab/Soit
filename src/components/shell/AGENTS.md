# src/components/shell/ — app chrome

Three-pane workspace chrome: left rail, center card host, right map/graph.

Parent: `src/AGENTS.md`. Map product notes: `知识库/docs/map-scale-lod.md` and active map specs under `知识库/specs/`.

## Pieces

| File | Role |
|------|------|
| `AppShell.tsx` | Grid shell; hosts rail + card + map; collapse/`rail-collapsed` |
| `LeftRail.tsx` | Thread list, unread/live cues, collapse control; vault bind/unbind (unbind keeps lastVault) |
| `MapStage.tsx` / `GraphCanvas.tsx` | Map mode + SVG graph; focus via store |
| `LocusPeek.tsx` | Locus / path peek beside map |
| `CommandPalette.tsx` | Jump / rank via `lib/paletteRank` |
| `ReentryBanner.tsx` | Resume previous focus hint |

## Rules

- Shell must render **without** a selected vault (fast-start contract).
- Navigation changes **focus** through `useWorkspace` (`focusNode`, mode toggles) — do not keep a second focus source of truth in local shell state.
- Map LOD / scope modes come from store + `lib/mapScope.ts`; respect caps and roles instead of dumping the full graph unfiltered.
- Respect `prefers-reduced-motion` for enter/layout motion (shared with card CSS).

## Do not

- Gate first paint on host IO or vault picker.
- Implement deepen/diverge card body UI here (belongs in `components/card` + `overlays`).
