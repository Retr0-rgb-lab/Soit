# 资料轨 + materials 导入 + 拖分栏 — Spec v1.0

> 日期: 2026-08-20  
> 依据: 用户需求「设置下资料按钮 → 右侧列表 → 点选预览」；`知识库/docs/materials-rail-fsm.md`；共识 §2.2；PEL-156 DocSession 已落地  
> 基线分支: `main`  
> 前置依赖: PEL-156 v1.1（`resolve_vault_doc` / `read_vault_text` / DocPane / openDoc）；设置齿轮 chrome  
> **SSoT:** 本文件。`知识库/specs/` 仅 stub。

---

## 摘要

在右上设置齿轮**下方**增加「资料」按钮，展开右侧 **MaterialsRail**，懒列出当前 vault 的 `materials/` 文件；点选走既有 `openDoc` 只读预览。支持 **导入复制进 materials/**，以及 Card|DocPane **可拖分隔条**调宽。不做成第二文件树产品，不扫全 vault。

---

## 0. 前置依赖

| 已有 | 说明 |
|------|------|
| DocSession + `openDoc` / DocPane | PEL-156；md/text 预览，pdf 引导 |
| `resolve_vault_doc` / `read_vault_text` | Host 沙箱读 |
| `settings-gear` 右上常驻 | `AppShell` + `settings.css` |
| `OpenDocPopover` 路径打开 | 可保留；资料轨成主入口 |
| 共识 §2.2 / `materials-rail-fsm.md` | 本波产品边界（编排已写） |

---

## 1. 现状

| 缺口 | 证据 |
|------|------|
| 无资料轨 UI | 仅 `settings-gear`，无 materials toggle |
| 无 `materials/` 约定实现 | 对象模型已补文档，Host 无 list/import |
| 打开靠路径 popover | `OpenDocPopover`；用户难发现 vault 内文件 |
| split 仅 CSS flex 档位 | `.workspace-split` / `is-doc-wide`；**无拖条** |
| Composer 附件不落 vault | `composerPayload` ephemeral |

---

## 2. 需要做的工作

### 2.1 知识库门闩

确认已含：`materials-rail-fsm.md`、共识 §2.2、对象模型 materials/、非目标、card-stage-chrome 资料轨段。Fixer 勿回退。

### 2.2 Host：list + import materials（P0）

| Command | 入参 | 出参 |
|---------|------|------|
| `list_vault_materials` | `{ maxDepth?: number, maxEntries?: number }` | `{ ok, entries?: MaterialsEntryDto[], error? }` |
| `import_vault_material` | `{ fileName: string, bytesBase64: string }` 或 FE 先写 temp——**P0：base64 小文件**；单文件上限 **15_000_000** raw | `{ ok, pathRel?, error? }` |

**规则：**

1. 宇宙未打开 → error  
2. 根目录 = `vault/materials/`；不存在则 list 返回空数组（ok）；import 时 `create_dir_all`  
3. list：仅 materials 子树；canonicalize + starts_with(materials_canon)；跳过 `.soit`（本不应在内）  
4. maxDepth 默认 **2**；maxEntries 默认 **200**；超限截断 + 不报 fatal  
5. 每项：pathRel（`materials/...` 用 `/`）、name、kind（复用 doc probe）、size、mtimeMs 可选  
6. import：解码 bytes → `materials/<safeName>`；非法名 sanitize；重名 `stem (n).ext`；拒绝 path 逃逸  
7. **禁止** import 到 materials 外  
8. 权限 + `default.json`  
9. Rust 单测：temp vault list/import/reject escape  
10. **不为 list 在 bootstrap 跑**

**浏览器 mock：** 固定 entries 含 `demo/welcome.md` 映射为可 open 的 mock 路径；或 list 返回 `[{ pathRel: 'demo/welcome.md', ...}]` 与既有 mock read 对齐。若 mock 无真正 materials，list 返回 demo fixture 并标注。

**路径策略拍板：** mock 继续 `demo/welcome.md`；桌面 list 只出 `materials/**`。OpenDocPopover 仍可打开 vault 内任意沙箱路径（PEL-156）；资料轨只浏览 materials。

### 2.3 FE：materialsRail 状态（P0）

**`src/lib/materialsRail.ts` + test** 纯 reduce 可选；或直接 workspaceStore 字段：

```ts
type MaterialsListStatus = "idle" | "loading" | "ready" | "error";
type MaterialsEntry = {
  pathRel: string;
  name: string;
  kind: "md" | "text" | "pdf" | "unsupported";
  size: number;
  mtimeMs?: number;
};
type MaterialsRailState = {
  open: boolean;
  listStatus: MaterialsListStatus;
  entries: MaterialsEntry[];
  error: string | null;
  selectedPathRel: string | null;
  listEpoch: number;
  importBusy: boolean;
};
```

Actions：

- `toggleMaterialsRail()`  
- `openMaterialsRail()` / `closeMaterialsRail()`  
- `refreshMaterialsList()`  
- `selectMaterial(pathRel)` → set selected + **`openDoc(pathRel)`**；若 `workspaceMode==='map'` → **先 `setWorkspaceMode('focus')` 再 openDoc**  
- `importMaterials(files: File[] | {name, base64}[])`  

**force_close rail：** `loadSnapshot`、进入 map（`setWorkspaceMode('map')` / toggleMap）时 `closeMaterialsRail`（不清 Doc——Doc 自己 force_close）。

### 2.4 UI：齿轮下按钮 + MaterialsRail（P0）

1. **Chrome 栈**（`AppShell`）：  
   ```html
   <div class="chrome-stack">
     <button class="settings-gear" …/>
     <button class="materials-toggle" aria-label="资料" aria-expanded={railOpen}/>
   </div>
   ```  
   CSS：`.chrome-stack` 右上 fixed；materials 在齿轮**下方** spacing 8px。  

2. **`MaterialsRail.tsx`**：  
   - header：资料 / 刷新 / 导入 / 关闭  
   - 未绑库：文案 + 链到设置·空间  
   - list：文件名、kind 徽章、size；当前预览项高亮  
   - 点击行 → `selectMaterial`  
   - 空态：说明把文件放进 vault/materials 或点导入  

3. **挂载：** `app-shell` 内 rail open 时 `body` 右侧 dock；`workspace-main` 加 `padding-inline-end` 或 grid 列避免被挡。  
   ```text
   app-shell
     LeftRail | workspace-main | MaterialsRail(open?) | chrome-stack
   ```

4. Esc：插入 **materials close** 在 open-doc 之后、doc close 之前（见 FSM）。

5. 事件：`soit:toggle-materials` / `soit:open-materials`。

### 2.5 拖分栏 SplitRatio（P0）

1. `src/lib/splitRatio.ts`：clamp 0.28–0.72；read/write localStorage `soit-doc-split-ratio`  
2. `workspace-split` 内 Card 与 DocPane 之间 **`SplitSash`**：pointer drag 改 `--doc-fraction` 或 flex-basis %  
3. 双击 sash → 默认 0.42  
4. 保留「加宽」按钮 = 设为 0.68 或 toggle doc-wide（与 drag 共存：doc-wide 仍可用 class，或统一为 fraction）  
   **拍板：** drag 更新 fraction；`doc-wide` layout 仍设 fraction=0.68；`split` 用存储的 fraction。  

5. 单测 clamp；手动/轻测可选。

### 2.6 导入入口（P0）

- MaterialsRail「导入」→ hidden `<input type="file" multiple>`  
- 读为 base64 → `import_vault_material` 逐个  
- 成功 refresh；**打开最后一个成功文件**（或第一个——拍板：**第一个成功**）  
- 单文件超限 toast/error 行内  

### 2.7 AGENTS（P1）

- `shell/AGENTS.md` chrome-stack + Esc  
- `doc/AGENTS.md` 或 `materials/AGENTS.md`  
- `src-tauri/AGENTS.md` list/import  
- 知识库 specs stub  

---

## 3. 文件变更清单

| 文件 | 变更 | 节 |
|------|------|-----|
| `知识库/docs/materials-rail-fsm.md` 等 | 已写；校验 | 2.1 |
| `src-tauri/src/doc/mod.rs` 或 `materials.rs` | list + import | 2.2 |
| `src-tauri/src/lib.rs` + permissions + capabilities | 注册 | 2.2 |
| `src/lib/host.ts` + types | bridge + mock | 2.2 |
| `src/lib/materialsRail.ts` + test | 可选纯逻辑 | 2.3 |
| `src/lib/splitRatio.ts` + test | fraction | 2.5 |
| `src/state/workspaceStore.ts` | rail state + force_close | 2.3 |
| `src/components/shell/MaterialsRail.tsx` + css | UI | 2.4 |
| `src/components/shell/AppShell.tsx` | chrome-stack + rail + Esc + split sash | 2.4/2.5 |
| `src/components/shell/settings/settings.css` 或 `app.css` | chrome-stack | 2.4 |
| `src/components/doc/DocPane.tsx` | 与 fraction 协调 | 2.5 |
| AGENTS + stub | 文档 | 2.7 |

---

## 4. 架构图

```text
[materials-toggle under ⚙]
        │ toggle
        ▼
  MaterialsRail open
        │ list_vault_materials (lazy)
        ▼
  entries[] ──click──► selectMaterial
                            │
              map? ──yes──► setMode(focus)
                            │
                            ▼
                      openDoc(pathRel) ──► DocSession ──► DocPane
                            │
  import ──► import_vault_material ──► refresh list ──► openDoc(first)

workspace-split: [ Card | sash | DocPane ]  fraction ∈ [0.28,0.72]
```

```text
MaterialsRail: closed ⇄ open(list loading|ready|error)
DocSession:    (unchanged PEL-156)
force_close:   map/loadSnapshot → rail closed + doc closed(existing)
```

---

## 5. 实施顺序

| 阶段 | 计划 | 依赖 | 并行 |
|------|------|------|------|
| W1 | **M1** Host list + import + tests | — | ∥ M2 |
| W1 | **M2** splitRatio + materialsRail pure/helpers + tests | — | ∥ M1 |
| W2 | **M3** store + host.ts bridge + force_close | M1,M2 | |
| W2 | **M4** MaterialsRail UI + chrome-stack + Esc + import input | M3 | |
| W3 | **M5** SplitSash + AppShell fraction + AGENTS + verify | M4 | |

```text
Wave 1: M1 ‖ M2
Wave 2: M3 → M4
Wave 3: M5
```

冲突：M3/M4/M5 都可能碰 AppShell/store → 严格串行 M3→M4→M5；M4 可改 AppShell 挂载，M5 再加 sash。

---

## 6. 验收标准

- [ ] 设置齿轮下方有资料按钮；toggle 开/关轨  
- [ ] 绑库后 list `materials/`（空目录空态友好）  
- [ ] 导入文件出现在列表且落在 vault/materials（桌面）  
- [ ] 点 md/text → DocPane 预览；点 pdf → 引导态  
- [ ] map 下点文件 → 回 focus 并预览  
- [ ] loadSnapshot/解绑 → 轨关闭  
- [ ] Card|Doc 可拖宽，刷新后比例保持  
- [ ] Esc 顺序含关轨  
- [ ] 冷启动不 list materials  
- [ ] `npm test` + `npm run build` + `cargo test`  
- [ ] mock dev 可开资料轨并点 demo 预览  

---

## 7. 不在范围

- 全 vault 文件树 / 多根目录  
- materials 内建编辑器  
- 实时 watch Obsidian 改动（手动刷新即可）  
- PDF 内嵌 pdfjs（仍 PEL-156 P1）  
- 按卡自动分子目录  
- 资料轨宽度拖拽（固定宽 v1）  
- 云同步  

---

## 8. 版本变更

| 版本 | 说明 |
|------|------|
| v1.0 | 首版：资料轨 + import + 拖分栏 |
| v1.1 | （Oracle 后） |
