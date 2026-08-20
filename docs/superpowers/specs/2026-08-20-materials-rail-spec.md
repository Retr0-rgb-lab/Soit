# 资料轨 + materials 导入 + 拖分栏 — Spec v1.1

> 日期: 2026-08-20  
> 依据: 用户需求「设置下资料按钮 → 右侧列表 → 点选预览」；`知识库/docs/materials-rail-fsm.md`；共识 §2.2；PEL-156 DocSession；Oracle REVISE → v1.1  
> 基线分支: `main`  
> 前置依赖: PEL-156 v1.1；设置齿轮 chrome  
> **SSoT:** 本文件。`知识库/specs/` 仅 stub。

---

## 摘要

右上设置齿轮**下方**增加「资料」按钮，展开 **MaterialsRail**，懒列出 vault `materials/`；点选 → 既有 `openDoc` 只读预览。支持 **≤2MB base64 导入复制进 materials/**（更大请用户直接放进文件夹后刷新），以及 Card|DocPane **可拖分隔条**。不做成第二文件树，不扫全 vault。

---

## 0. 前置依赖

| 已有 | 说明 |
|------|------|
| DocSession + `openDoc` / DocPane | PEL-156 |
| `resolve_vault_doc` / `read_vault_text` | Host 沙箱读 |
| `settings-gear` | AppShell 右上 |
| `OpenDocPopover` | 保留；资料轨为主浏览入口 |
| 共识 §2.2 / materials-rail-fsm | 产品边界 |

---

## 1. 现状

| 缺口 | 证据 |
|------|------|
| 无资料轨 | 仅 `settings-gear` |
| 无 list/import materials | `doc/mod.rs` 仅 resolve/read |
| split 无拖条 | `.workspace-split` / `is-doc-wide` 档位 |
| 专注模式只藏 `.settings-gear` | 新 chrome-stack 必须一并藏 |
| map 顶栏只为单齿轮留白 | stack 变高需更新避让 |
| 无 base64 crate | import 需加依赖或等价 |

---

## 2. 需要做的工作

### 2.1 知识库门闩

`materials-rail-fsm.md`、共识 §2.2、对象模型、非目标、card-stage-chrome。命令名与 FSM 对齐 `list_vault_materials`。

### 2.2 Host：list + import（P0）

| Command | 入参 | 出参 |
|---------|------|------|
| `list_vault_materials` | `{ maxDepth?: number, maxEntries?: number }` | `{ ok, entries?, truncated?, error? }` |
| `import_vault_material` | `{ fileName: string, bytesBase64: string }` | `{ ok, pathRel?, error? }` |

**list 规则：**

1. 宇宙未打开 → error  
2. 根 = `vault/materials/`；不存在 → `{ ok:true, entries:[] }`  
3. 每条 canonicalize + `starts_with(materials_canon)`；拒绝 symlink 逃逸  
4. maxDepth 默认 **2**；maxEntries 默认 **200**；截断仍 ok（`truncated:true`）  
5. P0 **只返回文件**（flatten）；kind = `probe_kind` → md|text|pdf|unsupported  
6. pathRel = `materials/...` 正斜杠，可被 `resolve_vault_doc` 消费  
7. **禁止** bootstrap / open_universe 路径调用 list  
8. 权限 + capabilities  

**import 传输法（law）：**

- 仅 base64-through-invoke（本波无 dialog 插件）  
- **解码后 raw 上限 2_000_000 bytes**（非 15MB）  
- FE 先查 `file.size`；Host 在 write 前查 decoded 长度；超限 `{ ok:false, error:"file_too_large" }`  
- UI：请将大文件直接放入 `vault/materials/` 后点刷新  
- sanitize fileName：单段，无 `/` `\` `..`；重名 `stem (n).ext`  
- 仅写入 materials_canon 下  
- Cargo 加 `base64`（或等价）  
- P1：OS 路径复制（out of wave）  

**单测：** list 空/有文件；import ok；过大拒绝；逃逸拒绝。

### 2.3 FE materials rail 状态（P0）

```ts
type MaterialsRailState = {
  open: boolean;
  listStatus: "idle" | "loading" | "ready" | "error";
  entries: MaterialsEntry[];
  error: string | null;
  selectedPathRel: string | null;
  listEpoch: number;
  importBusy: boolean;
};
```

**force_close：**

| 事件 | rail | doc |
|------|------|-----|
| loadSnapshot | open=false | 既有 force_close |
| setWorkspaceMode map / toggle→map | open=false | 既有 force_close |
| setWorkspaceMode focus | 不变 | 不变 |
| rail toggle/Esc close | open=false；**不清** Doc | — |

**selectMaterial(pathRel):**

1. selectedPathRel = pathRel  
2. if map → **`setWorkspaceMode('focus')` 必须先于 openDoc**（禁幽灵 Doc+Orbit）  
3. await openDoc(pathRel)  
4. map 下可只开轨浏览；预览必出 map  

Doc close 后：**保留**列表高亮（不强制清 selectedPathRel）。

### 2.4 UI：chrome-stack + MaterialsRail（P0）

```text
app-shell
  LeftRail | workspace-main | MaterialsRail(open?)
  chrome-stack fixed top-right z≥40
    settings-gear
    materials-toggle   ← 齿轮正下方
```

- MaterialsRail 宽 **260px**；workspace-main rail open 时 `padding-inline-end: 260px`  
- rail z < settings/palette 模态  
- 专注模式：隐藏 **`.chrome-stack` 整体**（非仅 gear）  
- map 顶栏避让按 stack 高度  
- header：资料 / 刷新 / 导入 / 关闭  
- 未绑库 → 引导空间设置  
- Esc 全序：`settings → palette → open-doc → materials rail → doc → map→focus`  
- Ctrl+, / Ctrl+K **不强制**关轨  
- 事件：`soit:toggle-materials` / `soit:open-materials`  

### 2.5 导入 FE（P0）

- input multiple；`importBusy` 禁用按钮  
- 逐个 size 预检 → arrayBuffer → base64 → import  
- 成功 refresh；**打开第一个成功** pathRel  
- 失败不中断后续  
- **mock：** list 含 `demo/welcome.md`；import **内存追加 entries**（不写盘）；openDoc 仅对有 mock 正文的路径返回正文  

### 2.6 SplitRatio law（P0）

- 单一视觉源：`--doc-fraction` ∈ [0.28, 0.72]；默认 **0.42**；键 `soit-doc-split-ratio`  
- `layout==='split'`：用存储 fraction；sash 可见  
- `layout==='doc-wide'`：显示固定 **0.68**（不写 storage，除非用户拖）  
- 加宽按钮：toggle `split`⇄`doc-wide`；进 doc-wide **不**覆盖已存 split fraction  
- doc-wide 下拖 sash → 回到 `split` 并 persist 新 fraction  
- peek / empty 全宽 Doc：无 sash  
- 双击 sash → 0.42 + persist + layout=split  

### 2.7 AGENTS（P1）

shell / lib / tauri / materials 文档 + specs stub。

---

## 3. 文件变更清单

| 文件 | 变更 | 节 |
|------|------|-----|
| `src-tauri/src/doc/*` 或 materials | list + import | 2.2 |
| permissions + capabilities + lib.rs | 注册 | 2.2 |
| Cargo.toml | base64 | 2.2 |
| `src/lib/host.ts` + types | bridge + mock | 2.2/2.5 |
| `src/lib/splitRatio.ts` + test | fraction | 2.6 |
| `src/lib/materialsRail.ts` + test | 可选 reduce | 2.3 |
| `src/state/workspaceStore.ts` | rail + select + force_close | 2.3 |
| `MaterialsRail.tsx` + css | UI | 2.4 |
| `AppShell.tsx` | stack + Esc + rail + sash | 2.4/2.6 |
| `settings.css` / `app.css` / `card.css` | chrome-stack hide focus | 2.4 |
| `DocPane.tsx` | 加宽遵守 fraction law | 2.6 |
| AGENTS | 文档 | 2.7 |

---

## 4. 架构图

```text
materials-toggle → MaterialsRail
  list_vault_materials (lazy)
  import_vault_material (≤2MB)
  click → focus if map → openDoc → DocPane

workspace-split: Card | sash | DocPane  (--doc-fraction)
```

---

## 5. 实施顺序

```text
Wave 1: M1 ‖ M2
Wave 2: M3 → M4
Wave 3: M5
```

| 计划 | 内容 |
|------|------|
| M1 | Host list/import@2MB + tests |
| M2 | splitRatio + sanitize helpers + tests |
| M3 | store + host bridge + mock + force_close |
| M4 | MaterialsRail + chrome-stack + Esc + import UI |
| M5 | SplitSash + DocPane fraction + AGENTS + verify |

---

## 6. 验收标准

- [ ] 齿轮下资料按钮；toggle 开/关  
- [ ] 绑库 list materials（空态友好）  
- [ ] 导入 ≤2MB 落盘+列表；>2MB 拒并提示文件夹刷新；Host 测覆盖  
- [ ] 点 md/text 预览；pdf 引导  
- [ ] map 点文件 → 出 map + DocPane；Orbit 与 Doc 不同挂  
- [ ] loadSnapshot/解绑 → 轨关  
- [ ] 拖宽 + 加宽 law；刷新保持 split fraction  
- [ ] 专注模式 chrome-stack 全藏  
- [ ] Esc 顺序含关轨  
- [ ] 冷启动不 list  
- [ ] 无 15MB 级 base64 常量  
- [ ] npm test + build + cargo test  
- [ ] mock 可开轨并点 demo 预览  

---

## 7. 不在范围

- 全 vault 树；materials 编辑器；watch 刷新  
- PDF pdfjs；轨宽拖拽  
- 按卡分子目录；云同步  
- dialog 路径复制 import（P1）  
- 15MB base64 invoke  

---

## 8. 版本变更

| 版本 | 说明 |
|------|------|
| v1.0 | 首版 |
| v1.1 | Oracle：import 2MB；SplitRatio↔doc-wide；Esc/chrome/map select；list 命令名；mock import |
