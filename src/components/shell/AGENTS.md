# src/components/shell/ — app chrome

Workspace chrome: floating left orbit rail, center card host, map/graph.

Parent: `src/AGENTS.md`. Map product notes: `知识库/docs/map-scale-lod.md`.

## Pieces

| File | Role |
|------|------|
| `AppShell.tsx` | Shell; rail collapse (`Ctrl+B`); card + map |
| `LeftRail.tsx` | **Orbit-only**: stacked Option Wheels + hide toggle |
| `FocusOrbit.tsx` | Multi-layer Option Wheel (hub = root, stacked rings) |
| `MapStage.tsx` / `GraphCanvas.tsx` | Map mode + SVG graph |
| `LocusPeek.tsx` | Locus peek |
| `CommandPalette.tsx` | Jump (Ctrl+K) |
| `ReentryBanner.tsx` | Resume hint |
| `EmptyWorkspace.tsx` | Empty vault CTA (bind / root) |
| `SkillsPanel.tsx` | Skills modal (not in rail) |

## LeftRail (current)

- Expanded: logo + hide + **FocusOrbit only**
- Collapsed: mark + show toggle
- Deferred from rail: 本库 bind UI, 活线 list, 最近, 线债, 图谱/技能 buttons (use shortcuts / empty workspace / later)

## Rules

- Shell renders without selected vault.
- Focus only via `useWorkspace.focusNode`.
- `prefers-reduced-motion` → flat wheel lists.

## Do not

- Re-stuff Notion-like multi-section chrome into the rail without product decision.
- Gate first paint on vault IO.
