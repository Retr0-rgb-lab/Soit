# src/components/shell/ — app chrome

Three-pane workspace chrome: left rail, center card host, right map/graph.

Parent: `src/AGENTS.md`. Map product notes: `知识库/docs/map-scale-lod.md` and active map specs under `知识库/specs/`.

## Pieces

| File | Role |
|------|------|
| `AppShell.tsx` | Grid shell; hosts rail + card + map; collapse/`rail-collapsed` |
| `LeftRail.tsx` | IA: compact 本库; accordion 活线/最近/线债; debt badges; collapsed HUD; hosts FocusOrbit; vault bind/unbind (unbind keeps lastVault) |
| `FocusOrbit.tsx` | Side-arc focus navigator under 活线 (`buildOrbitModel`); click → `focusNode` |
| `MapStage.tsx` / `GraphCanvas.tsx` | Map mode + SVG graph; focus via store |
| `LocusPeek.tsx` | Locus / path peek beside map |
| `CommandPalette.tsx` | Jump / rank via `lib/paletteRank` |
| `ReentryBanner.tsx` | Resume previous focus hint |

## LeftRail IA (PEL-149 P0)

- **本库** single compact row (not a tall vault block).
- **活线** accordion default open: live roots + optional `FocusOrbit`; 线债 count badge on live roots when unread.
- **最近** accordion default closed; true MRU only — never pad with full `nodes`.
- **线债** accordion default closed; expandable thread debt details.
- Collapsed rail HUD: live count + unread total badges, then 图谱 / 跳转.
- Naming fence: 本库 / 活线 / 移出活线 (not 宇宙/记忆库).

## Rules

- Shell must render **without** a selected vault (fast-start contract).
- Navigation changes **focus** through `useWorkspace` (`focusNode`, mode toggles) — do not keep a second focus source of truth in local shell state.
- Map LOD / scope modes come from store + `lib/mapScope.ts`; respect caps and roles instead of dumping the full graph unfiltered.
- Respect `prefers-reduced-motion` for enter/layout motion (shared with card CSS).

## Do not

- Gate first paint on host IO or vault picker.
- Implement deepen/diverge card body UI here (belongs in `components/card` + `overlays`).
