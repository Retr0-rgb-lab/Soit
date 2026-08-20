# src/components/shell/ — app chrome

Workspace chrome: floating left orbit rail, center card/doc host, map/graph.

Parent: `src/AGENTS.md`. Map product notes: `知识库/docs/map-scale-lod.md`.
Doc companion (PEL-156): `docs/superpowers/specs/2026-08-20-doc-companion-viewer-spec.md`; UI in `components/doc/`.

## Pieces

| File | Role |
|------|------|
| `AppShell.tsx` | Shell; rail collapse (`Ctrl+B`); **chrome-stack** (gear + materials toggle); center matrix (card / DocPane / Orbit); Esc order |
| `MaterialsRail.tsx` | Right dock: vault `materials/` list + ≤2MB import; click → `selectMaterial` → `openDoc` |
| `SplitSash.tsx` | `WorkspaceSplit`: Card \| sash \| DocPane; owns `--doc-fraction` + persist (`lib/splitRatio`) |
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
| `CommandPalette.tsx` | Jump (Ctrl+K); **打开文档…** → `soit:open-doc` |
| `ReentryBanner.tsx` | Resume hint (unused in shell; kept for later) |
| `EmptyWorkspace.tsx` | Empty vault CTA; unbound → open settings · 空间 |
| `../doc/DocPane.tsx` | Read-only companion pane (mounted by AppShell matrix; not shell-owned state) |
| `../doc/OpenDocPopover.tsx` | Path popover; opened via `soit:open-doc` (Composer / palette) |

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

### Center stage matrix (PEL-156)

`AppShell.renderFocusMain` owns mount points. Doc session state lives in `workspaceStore.docSession` — shell only reads status/layout and calls `closeDoc`.

| workspaceMode | showEmpty | doc surface | 中栏 |
|---------------|-----------|-------------|------|
| map | * | * (force-closed) | **Orbit only** — never mount Doc with Orbit |
| focus | no | closed | InquiryCard full width |
| focus | no | open + split/doc-wide | `.workspace-split`：Card \| **sash** \| DocPane (`--doc-fraction`; `is-doc-wide` display 0.68) |
| focus | no | open + peek | Card full width + DocPane fixed overlay (**no** sash) |
| focus | yes | closed | EmptyWorkspace |
| focus | yes | open + not peek | DocPane full width (`boundCardId` may be null; **no** sash) |
| focus | yes | open + peek | EmptyWorkspace + DocPane overlay |

- Open entry: Composer tool / CommandPalette → `soit:open-doc` → `OpenDocPopover`; **MaterialsRail** click → `selectMaterial` (map → focus first) → `openDoc`. No `window.prompt`; no file picker as main path (import input is materials-only).
- Doc UI details: `components/doc/AGENTS.md`. Spec: `docs/superpowers/specs/2026-08-20-materials-rail-spec.md` §2.4–2.6.

### SplitRatio law (`SplitSash` / `lib/splitRatio`)

- CSS var `--doc-fraction` ∈ [0.28, 0.72]; default **0.42**; localStorage `soit-doc-split-ratio` (never universe.db).
- `layout==='split'`: stored fraction; sash visible. `doc-wide`: display **0.68** only (no auto-persist).
- Drag sash → update fraction + persist; if was doc-wide → `setDocLayout("split")`. Double-click sash → 0.42 + persist + split.
- DocPane **加宽** toggles layout only — must not write fraction.

### Materials chrome

- `chrome-stack` (gear + materials toggle) fixed top-right; **focus mode hides whole stack**.
- MaterialsRail 260px right dock; `soit:toggle-materials` / `soit:open-materials`. Ctrl+, / Ctrl+K do **not** force-close rail.
- Lazy `list_vault_materials` on open — never bootstrap.

### Esc order (`AppShell` keydown)

1. settings → close  
2. command palette → close  
3. open-doc popover → close  
4. materials rail open → `closeMaterialsRail()` (does **not** close Doc)  
5. doc surface open (any layout, incl. peek) → `closeDoc()`  
6. map → `setMode("focus")`  

Card-local overlays (selbar / chooser / term float / pip) handle their own Esc inside the card tree before shell logic matters.

### Map ↔ Doc (`force_close`)

- Entering map (`setWorkspaceMode("map")` / `toggleMapMode` → map) **force_closes** DocSession in the store (epoch bump; drop inflight). Shell never keeps Doc mounted beside Orbit.
- `loadSnapshot` (boot, bind/unbind, host merge) also **force_closes** Doc.
- Focus enter/exit and focusNode do **not** close Doc; may rebind `boundCardId` to new focus when previously unbound or bound to prior focus.

### Global orbit / 圆图层级（硬规则）

- **圆图永远画在应用背景（app paper）上，不得叠在卡片之上。**
- **禁止** card 与 `OrbitStage` 同时挂在 DOM 里用 z-index 分前后（Chrome 实测：opacity:0 的 card 仍会挡在圆图上）。
- 进入全局视角（`workspaceMode === "map"`）时序（`AppShell`）：
  1. **仅卡片**播放下滑 fade（`center-stage.is-map-exit`）——此时 **不挂载** `OrbitStage`；Doc 已由 store `force_close` 卸下
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
- Mount DocPane together with OrbitStage (map always force-closes doc first).
- Treat DocSession as a third graph node or persist it in universe.db.
