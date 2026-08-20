# src/components/shell/ — app chrome

Workspace chrome: floating left orbit rail, center card host, map/graph.

Parent: `src/AGENTS.md`. Map product notes: `知识库/docs/map-scale-lod.md`.

## Pieces

| File | Role |
|------|------|
| `AppShell.tsx` | Shell; rail collapse (`Ctrl+B`); **settings gear + Ctrl+,**; card + map |
| `LeftRail.tsx` | **Orbit-only**: FocusOrbit + hide toggle |
| `FocusOrbit.tsx` | Multi-layer Option Wheel (hub = root, stacked rings) |
| `SettingsPanel.tsx` | Settings modal — sections 空间 / 模型 / 技能 / 关于 |
| `settings/SpaceSection.tsx` | Vault bind / switch / unbind / lastVault |
| `settings/ModelSettingsForm.tsx` | BYOK (single source; Composer chip only) |
| `settings/SkillsList.tsx` | Skills toggles (embedded, not a second modal) |
| `settings/AboutSection.tsx` | Version + memory boundary copy |
| `MapStage.tsx` / `GraphCanvas.tsx` | Map mode + SVG graph |
| `LocusPeek.tsx` | Locus peek |
| `CommandPalette.tsx` | Jump (Ctrl+K) |
| `ReentryBanner.tsx` | Resume hint |
| `EmptyWorkspace.tsx` | Empty vault CTA; unbound → open settings · 空间 |

## LeftRail (current)

- Expanded: hide toggle + **FocusOrbit only** (no logo / vault / live lists)
- Collapsed: show toggle
- Settings / bind / skills: **SettingsPanel** (gear, Ctrl+,), never re-stuff rail

## Settings IA

- 空间 → open/close universe (path text; no folder dialog v1)
- 模型 → BYOK; dispatches `soit:chat-config-changed`
- 技能 → SkillsList; unbound guides to 空间
- 关于 → version + db/md/key boundaries
- Events: `soit:open-settings` `{ section? }`; `soit:open-skills` → settings skills

## Rules

- Shell renders without selected vault.
- Focus only via `useWorkspace.focusNode`.
- `prefers-reduced-motion` → flat wheel lists.

## Do not

- Re-stuff Notion-like multi-section chrome into the rail without product decision.
- Gate first paint on vault IO.
