# src/components/shell/ — app chrome

Workspace chrome: floating left orbit rail, center card/doc host, map/graph.

Parent: `src/AGENTS.md`. Map product notes: `知识库/docs/map-scale-lod.md`.
Doc companion (PEL-156): `docs/superpowers/specs/2026-08-20-doc-companion-viewer-spec.md`; UI in `components/doc/`.

## Pieces

| File | Role |
|------|------|
| `AppShell.tsx` | Shell; rail collapse (`Ctrl+B`); **settings gear bottom-left**; **right-edge triangle** opens companion; center matrix; Esc |
| `CompanionPane.tsx` | **One** right slot: materials list **or** DocPane preview (never both as two columns) |
| `MaterialsRail.tsx` | List body only (`MaterialsList`); embedded in CompanionPane |
| `SplitSash.tsx` | `WorkspaceSplit`: Card \| sash \| CompanionPane; owns `--doc-fraction` + persist (`lib/splitRatio`) |
| `LeftRail.tsx` | Orbit (top) + PathLineNav (bottom) + hide toggle |
| `FocusOrbit.tsx` | Stable world orbit + camera pan (orbitNav) |
| `PathLineNav.tsx` | Line Sidebar: hub→focus radial path only; 7-row window; hide |
| `SettingsPanel.tsx` | Settings modal — 空间 / **外观** / 模型 / 运行时 / 技能 / 关于 |
| `settings/SpaceSection.tsx` | Vault bind / switch / unbind / lastVault |
| `settings/AppearanceSection.tsx` | Theme (5) + font family + font size — `lib/appearance.ts` |
| `settings/ModelSettingsForm.tsx` | 模型段壳：子 Tab 供应商 \| 可用模型；默认空供应商→供应商，否则可用模型 |
| `settings/ProvidersPanel.tsx` | BYOK 供应商列表 + 添加/编辑/删除（级联模型；密钥列表只显示已配置/未配置） |
| `settings/ProviderForm.tsx` | 供应商表单：名*、Base URL*（http/s）、API Key（编辑留空不改） |
| `settings/ModelsPanel.tsx` | 可用模型目录 + 启用开关 + 设为对话模型 + 编辑/删除 |
| `settings/ModelForm.tsx` | 模型表单：供应商*、Model ID*、可选显示名 |
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
- **模型** (nav hint: **供应商 · 密钥**) → 本机 BYOK 多供应商 + 模型目录；**不**抄套餐墙 / ChatGPT 登录
  - 权威数据：`ModelSettings` v1（`providers[]` / `models[]` / `activeModelId`）via `getModelSettings` / `setModelSettings`
  - 子 Tab：**供应商**（凭证+端点）· **可用模型**（目录 + 对话选用）
  - 删供应商 → 级联删其下模型；若删到 active → `activeModelId=null`（回 Mock）
  - 编辑供应商 API Key 留空 → 保留旧密钥；列表永不展示密钥明文
  - Base URL 须 http(s)；保存后 `soit:chat-config-changed`；Composer chip：`Mock · 本地` / `在线 · {label|modelId}`
  - 投影：`getChatConfig` = active → 旧扁平 `ChatConfig`（Port 兼容）；密钥仅 app config / localStorage，**不进** universe.db
  - Spec: `docs/superpowers/specs/2026-08-20-model-providers-spec.md`
- **运行时** → external coding-agent detect/prefs/`enableSpawn`
- 技能 → SkillsList; unbound guides to 空间
- 关于 → version + db/md/key boundaries
- Nav order (frozen): **空间 · 外观 · 模型 · 运行时 · 技能 · 关于**
- Events: `soit:open-settings` `{ section? }` including `appearance` / `runtime` / `model`; `soit:open-skills` → settings skills
- `RuntimeSection` lazy-loads runtimes **on first select**, not App boot
- No CDN fonts; appearance never writes universe.db

## Rules

- Shell renders without selected vault.
- Focus only via `useWorkspace.focusNode`.
- `prefers-reduced-motion` → flat wheel lists.
- Card stage chrome (专注模式 / drag / motion sync): `知识库/docs/card-stage-chrome.md`. Shared clock `--motion-focus` with FocusOrbit camera.

### Center stage matrix (PEL-156)

`AppShell.renderFocusMain` owns mount points. Doc session state lives in `workspaceStore.docSession` — shell only reads status/layout and calls `closeDoc`.

| workspaceMode | showEmpty | companion | 中栏 |
|---------------|-----------|-----------|------|
| map | * | force-closed | **Orbit only** |
| focus | no | closed | InquiryCard full width |
| focus | no | open (list **or** preview) | `.workspace-split`：Card \| sash \| **CompanionPane** |
| focus | yes | closed | EmptyWorkspace |
| focus | yes | open | CompanionPane full width |

- Companion `view=list` → materials browser; `view=preview` → DocPane in **same** slot. **Never** third dock column.
- Materials toggle / file click / path popover all feed CompanionPane.
- Doc UI: `components/doc/AGENTS.md`. FSM: `知识库/docs/materials-rail-fsm.md`.

### SplitRatio law (`SplitSash` / `lib/splitRatio`)

- CSS var `--doc-fraction` ∈ [0.28, 0.72]; default **0.42**; localStorage `soit-doc-split-ratio` (never universe.db).
- `layout==='split'`: stored fraction; sash visible. `doc-wide`: display **0.68** only (no auto-persist).
- Drag sash → update fraction + persist; if was doc-wide → `setDocLayout("split")`. Double-click sash → 0.42 + persist + split.
- DocPane **加宽** toggles layout only — must not write fraction.

### Materials / settings chrome

- **Settings gear:** fixed **bottom-left** (offsets past left rail); no top-right stack (avoids overlapping companion).
- **No permanent materials button.** Right-edge hover zone shows a **triangle**; click → `openMaterialsRail()` (companion list in split slot).
- Hidden while companion already open or in map mode. Focus mode hides gear + edge affordance.
- Events still: `soit:toggle-materials` / `soit:open-materials`.
- Lazy `list_vault_materials` on open — never bootstrap.
- Close companion → also ends DocSession (one surface).

### Esc order (`AppShell` keydown)

1. settings → close  
2. command palette → close  
3. open-doc popover → close  
4. materials companion open → `closeMaterialsRail()` (closes list **and** preview)  
5. doc-only surface (path open without materials) → `closeDoc()`  
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
