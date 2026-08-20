# PEL-149 conflict matrix

| Plan | Files | Wave |
|------|-------|------|
| 01 orbitLayout | `src/lib/orbitLayout.ts`, `*.test.ts` | 1 parallel |
| 02 FocusOrbit | `FocusOrbit.tsx/css`, optional orbitLayout if missing | 1 parallel |
| 03 LeftRail | `LeftRail.tsx`, `app.css` (rail), `tokens.css` | 1 parallel, **merge last** |

Merge order: **01 → 02 → 03**

Shared: `orbitLayout.ts` — 01 canonical; 02/03 only stub if absent.
