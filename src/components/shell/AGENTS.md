# src/components/shell/ — app chrome

Workspace chrome: floating left orbit rail, center card host, map/graph.

Parent: `src/AGENTS.md`. Map product notes: `知识库/docs/map-scale-lod.md`.

## Pieces

| File | Role |
|------|------|
| `AppShell.tsx` | Shell; rail collapse (`Ctrl+B`); **settings gear + Ctrl+,**; card + map |
| `LeftRail.tsx` | Orbit (top) + PathLineNav (bottom) + hide toggle |
| `FocusOrbit.tsx` | Stable world orbit + camera pan (orbitNav) |
| `PathLineNav.tsx` | Line Sidebar: hub→focus radial path only; 7-row window; hide |
| `SettingsPanel.tsx` | Settings modal — sections 空间 / 模型 / 技能 / **Runtime** / 关于 |
| `settings/SpaceSection.tsx` | Vault bind / switch / unbind / lastVault |
| `settings/ModelSettingsForm.tsx` | BYOK (single source; Composer chip only) |
| `settings/SkillsList.tsx` | Skills toggles (embedded, not a second modal) |
| `settings/RuntimeSection.tsx` | *(planned dual-track)* detect/list runtimes + prefs; handoff enable — spec v1.1 |
| `settings/AboutSection.tsx` | Version + memory boundary copy |
| `MapStage.tsx` / `GraphCanvas.tsx` | Map mode + SVG graph |
| `LocusPeek.tsx` | Locus peek |
| `CommandPalette.tsx` | Jump (Ctrl+K) |
| `ReentryBanner.tsx` | Resume hint (unused in shell; kept for later) |
| `EmptyWorkspace.tsx` | Empty vault CTA; unbound → open settings · 空间 |

## LeftRail (current)

- Expanded: hide toggle + **FocusOrbit** (top) + **PathLineNav** (bottom)
- PathLineNav = ancestor chain 圆心→当前 only (no same-ring siblings)
- 7 solid rows + wheel fade when path longer; section hide; click → focusNode
- Collapsed: show toggle
- Settings / bind / skills: **SettingsPanel** (gear, Ctrl+,), never re-stuff rail

## Settings IA

- 空间 → open/close universe (path text; no folder dialog v1)
- 模型 → BYOK; dispatches `soit:chat-config-changed`
- 技能 → SkillsList; unbound guides to 空间
- **Runtime** → *(planned)* external coding-agent detect/prefs/handoff; fifth settings section — dual-track spec v1.1
- 关于 → version + db/md/key boundaries
- Events: `soit:open-settings` `{ section? }` including `runtime`; `soit:open-skills` → settings skills

## Rules

- Shell renders without selected vault.
- Focus only via `useWorkspace.focusNode`.
- `prefers-reduced-motion` → flat wheel lists.
- Card stage chrome (fullscreen / drag / motion sync): `知识库/docs/card-stage-chrome.md`. Shared clock `--motion-focus` with FocusOrbit camera.

## Do not

- Re-stuff Notion-like multi-section chrome into the rail without product decision.
- Gate first paint on vault IO.
