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
| `SettingsPanel.tsx` | Settings modal — 空间 / **外观** / 模型 / 运行时 / 技能 / 关于 |
| `settings/SpaceSection.tsx` | Vault bind / switch / unbind / lastVault |
| `settings/AppearanceSection.tsx` | Theme (5) + font family + font size — `lib/appearance.ts` |
| `settings/ModelSettingsForm.tsx` | BYOK (single source; Composer chip only) |
| `settings/SkillsList.tsx` | Skills toggles (embedded, not a second modal) |
| `settings/RuntimeSection.tsx` | External coding-agent detect/prefs/handoff enable |
| `settings/AboutSection.tsx` | Version + memory boundary copy |
| `OrbitStage.tsx` | Global left-circle view (map mode) — card fades, orbit centers |
| `MapStage.tsx` / `GraphCanvas.tsx` | Legacy map scopes (kept; shell uses OrbitStage) |
| `LocusPeek.tsx` | Removed from shell (was bottom-right 方位) |
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
- **外观** → themes paper/matcha/celadon/ink/cinnabar + fonts system/song/hei/kai/mono + size sm–xl; `soit-appearance` localStorage; boot in `index.html`
- 模型 → BYOK; dispatches `soit:chat-config-changed`
- **运行时** → external coding-agent detect/prefs/`enableSpawn`
- 技能 → SkillsList; unbound guides to 空间
- 关于 → version + db/md/key boundaries
- Nav order (frozen): **空间 · 外观 · 模型 · 运行时 · 技能 · 关于**
- Events: `soit:open-settings` `{ section? }` including `appearance` / `runtime`; `soit:open-skills` → settings skills
- `RuntimeSection` lazy-loads runtimes **on first select**, not App boot
- No CDN fonts; appearance never writes universe.db

## Rules

- Shell renders without selected vault.
- Focus only via `useWorkspace.focusNode`.
- `prefers-reduced-motion` → flat wheel lists.
- Card stage chrome (专注模式 / drag / motion sync): `知识库/docs/card-stage-chrome.md`. Shared clock `--motion-focus` with FocusOrbit camera.

### Global orbit / 圆图层级（硬规则）

- **圆图永远画在应用背景（app paper）上，不得叠在卡片之上。**
- **禁止** card 与 `OrbitStage` 同时挂在 DOM 里用 z-index 分前后（Chrome 实测：opacity:0 的 card 仍会挡在圆图上）。
- 进入全局视角（`workspaceMode === "map"`）时序（`AppShell`）：
  1. **仅卡片**播放下滑 fade（`center-stage.is-map-exit`）——此时 **不挂载** `OrbitStage`
  2. 动画结束后 **卸载** `InquiryCard` / center-stage
  3. **再挂载** `OrbitStage` 作为 `workspace-main` 的 **唯一**主表面（流式 `flex:1`，无 absolute 盖层）
  4. 左轨小圆图淡出，避免双份圆
- 退出：点节点 / Esc /「返回卡片」→ `setMode("focus")` → 卸载 orbit，重新挂载卡片
- 禁止：圆图 `position:absolute` + 更高 `z-index` 盖 card；禁止 card `opacity:0` 仍留在 orbit 下面；禁止圆图坐在 card plate 阴影盒里
- **全局视角相机（Obsidian-like）**：`FocusOrbit panZoom` — 拖动画布平移、滚轮缩放（光标锚点）、双击空白 /「重置视角」/ `0` 复位；方向键微调平移。左轨小圆仍用空间导航滚轮，不自由缩放。

## Do not

- Re-stuff Notion-like multi-section chrome into the rail without product decision.
- Gate first paint on vault IO.
- Stack global orbit/graph chrome **over** the inquiry card.
