# 图谱规模保险丝与 LOD — Spec v1.1

> 日期: 2026-08-19  
> 依据: 五路压力测试思想实验；`知识库/docs/共识.md`；既有 Focus+Locus+Map+Ctrl+K  
> 基线分支: `feature/tauri-workspace-scaffold`  
> 前置依赖: Tauri 工作区脚手架 Spec v1.1；Focus/Map/Locus/Ctrl+K 已存在  
> Oracle: **REVISE → 已合入 v1.1**（working clamp、aggregate 契约、depthOf P0、GraphCanvas 兼容、DEV 归属、面包屑统一）

---

## 摘要

当前 Map 把**全库节点 + 全标签**塞进固定 `viewBox 0..200×300`，只适合 demo（~5 卡）。压力测试结论：N≥50 默认全图崩坏。本阶段把 Map 改为 **结构切片 + 递进披露**：默认 **工作集**（cone 为核 + recent/unread 有界并入 + hard clamp），路径高亮、远场 **opacity LOD（禁止高斯模糊）**，宽扇出 **聚合 stub（可 layout）**，未读/Ctrl+K **截断**，`layoutGraph` **深度迭代**，并提供 **压力种子 + 单测**。目标：N=100 仍能定向、跳转、分叉、读卡。

---

## 0. 前置依赖

| 项 | 状态 |
|----|------|
| Focus / Map、`workspaceMode` | 已有 |
| Locus peek | 已有；无 cap |
| GraphCanvas + layoutGraph | 无 LOD；`depthOf` guard>20 会压扁深链 |
| MapStage 全量 nodes + 全标签 | 主改点 |
| Ctrl+K | 空查询倾倒全库；无封顶 |
| 左栏未读 | 无上限 |
| 可点面包屑 | 深链不折叠 |

---

## 1. 现状

（与 v1.0 一致，代码审计成立。）

### 1.1 规模阈值（实现常量）

| 常量 | 值 | 用途 |
|------|-----|------|
| `SIBLING_CAP` | 12 | 同父可见兄妹上限（**含 focus**） |
| `CHILD_CAP` | 12 | 焦点直接子可见上限 |
| `EXPAND_STEP` | 12 | 点击聚合一次多揭示数 |
| `UNREAD_RAIL_CAP` | 12 | 左栏未读最多行 |
| `UNREAD_MAP_CAP` | 12 | working 额外未读最多纳入 |
| `PALETTE_RESULT_CAP` | 40 | Ctrl+K 最多渲染 |
| `MAP_HARD_NODE_CAP` | 80 | layout 后实体上限（真+聚合）；**选完必须 clamp** |
| `FIELD_NODE_OPACITY` | 0.28 | 远场节点 |
| `FIELD_EDGE_OPACITY` | 0.14 | 远场边 |
| `LAYOUT_DEPTH_MAX` | 256 | 替换 depthOf `guard > 20` |
| `DEEP_CRUMB_THRESHOLD` | 4 | 超过则折叠 |
| `DEEP_CRUMB_SHOW` | `root + … + parent + current` | 近端只保留直接父 |

---

## 2. 需要做的工作

### 2.1 图数据选择：cone / working / atlas（P0）

**新建** `src/lib/mapScope.ts`：

```ts
export type MapScopeMode = "cone" | "working" | "atlas";
export type NodeRole = "focus" | "path" | "context" | "field" | "aggregate";

export type MapNodeView = InquiryNode & {
  role: NodeRole;
  aggregateCount?: number;
  representsIds?: string[];
};

export type MapCaps = {
  siblingCap: number;
  childCap: number;
  hardCap: number;
  unreadMapCap: number;
};

/** groupKey e.g. `${parentId}:child` | `${parentId}:sibling` */
export type ExpandedCaps = Record<string, number>;
```

#### Cone

```ts
/**
 * FULL ancestor chain root→focus（禁止丢中间祖先：layout 会把孤儿当 root，边会断）
 * + siblings/children with caps + aggregate stubs.
 * 「压缩」只用于面包屑 collapseCrumbs。
 */
export function mapConeNodes(
  nodes: InquiryNode[],
  focusId: string,
  caps: MapCaps,
  expanded?: ExpandedCaps,
): MapNodeView[];
```

#### Working-set（确定性算法，可单测）

```ts
export function mapWorkingNodes(
  nodes: InquiryNode[],
  focusId: string,
  recentIds: string[],
  caps: MapCaps,
  expanded?: ExpandedCaps,
): MapNodeView[];
```

1. **Base cone** = `mapConeNodes`。  
2. **Add recent:** `recentIds` 序，跳过已在集/缺失，最多 8（与 store `RECENT_MAX` 一致）。  
3. **Add unread:** `unread && id ≠ focusId`，稳定按 title，最多 `UNREAD_MAP_CAP`。  
4. **Role：** focus；祖先 path；cone 内可见兄妹/子 context；聚合 aggregate；其余 recent/unread → **field**。  
5. **Hard clamp** 若 `length > MAP_HARD_NODE_CAP`：按序丢弃 `field` → 多余 context（并入 aggregate）→ 多余 recent/unread；**永不删** focus、path、path 父链、仍需要的 aggregate。最终 `assert ≤ 80`。  
6. **退化：** 若 recent∪unread 无增量，working **视觉=cone**（文案仍可写工作集）。无魔法「过小阈值」。

#### Atlas

```ts
export function mapAtlasNodes(
  nodes: InquiryNode[],
  focusId: string,
  caps: MapCaps,
): MapNodeView[];
```

- 每 root 下 branch proxy（`role=aggregate`，`parentId=root`）。  
- focus 在库中则提升祖先链为 path/focus。  
- 默认无叶标签。

#### 聚合 stub 硬约束

| 规则 | 原因 |
|------|------|
| `id = agg:<parentId>:<group>`，`group ∈ child\|sibling` | 稳定、不进 store |
| `parentId` = 真父且 **真父 ∈ views** | 否则边被滤掉或变 root |
| 被折真节点 **不在** views | 避免双画 |
| `kind ∈ NodeKind`（多数；并列 prefer diverge） | kindGlyph |
| 点击 stub：**禁止** `focusNode(aggId)` | store 无此 id |
| 展开 = 本地 `expandedCaps[groupKey] += EXPAND_STEP` | 会话 UI，不进 snapshot |

### 2.2 GraphCanvas LOD + layoutGraph（P0）

**GraphCanvas** 接收：

- `nodes: Array<InquiryNode | MapNodeView>`
- `focusId`
- `labelMode?: "all" | "lod" | "none"`（默认 `"none"`，Locus 兼容）

无 `role` 时：仅 focus 高亮（现状）。**W2-A 不得弄坏未改的 LocusPeek。**

| role | opacity | r | 标签（lod） |
|------|---------|---|-------------|
| focus | 1 | 12 | 是 |
| path | 1 | 10 | 是 |
| context | 0.58 | 7–8 | hover |
| field | 0.28 | 5.5 | 否 |
| aggregate | 0.85 | 11 | 是 |

- 边：`hot` 若端点 focus/path；`field` 若至少一端 field 且两端皆非 path/focus。  
- **禁止** 节点/边 `filter: blur()`。允许 focus drop-shadow、locus 面板 backdrop-filter。

**layoutGraph P0：**

1. 保留额外字段（role 等）到输出。  
2. **删除** `depthOf` 的 `guard > 20` 早退 → 迭代算深，上限 `LAYOUT_DEPTH_MAX`。  
3. 子集森林：缺父则局部 root。  
4. viewBox 本波仍 `0 0 200 300`。

### 2.3 MapStage（P0）

- 顶栏：`工作集 {drawn} · 库 {total}`（cone/总览换文案）。  
- 分段：`工作集 | 焦点锥 | 总览`；`mapScopeMode` **进 store**（W2-B）。  
- 真节点 click → `focusNode` + focus mode；aggregate → 本地 expand。  
- **DEV 压测菜单** 仅 `import.meta.env.DEV`（不进 LeftRail）。  
- 文案去「完整图谱」。

### 2.4 Locus cap（P0）

- 使用 cone 邻域逻辑或 cap 后的 siblings/children；`+N` DOM 或 aggregate。  
- `labelMode="none"`；文案去「完整」。

### 2.5 未读左栏（P0）

- ≤ `UNREAD_RAIL_CAP` +「还有 k 条未读」。  
- **无** DEV 菜单。

### 2.6 Ctrl+K（P0）

**新建** `src/lib/paletteRank.ts`：

- 空查询：recent → unread → 当前路径祖先；不倾倒全库。  
- 有查询：prefix > 子串；并列 recent/unread/距 focus 深度。  
- cap `PALETTE_RESULT_CAP`；脚注余数。

### 2.7 面包屑（P0）

- W1-A：`collapseCrumbs(chain, { threshold: 4 })` 在 `treeNav.ts`。  
- `length ≤ 4` 原样；否则 `[root, { id: "__ellipsis__", title: "…" }, parent, current]`。  
- CardHeader：ellipsis 展开本地 state；**不** `focusNode("__ellipsis__")`。

### 2.8 压力种子与测试（P0）

`src/lib/stressSeed.ts`：`stressFan(80)`、`stressDeep(40)`、`stressBushy(100)`、`stressMixed(100)`。

单测必须：

- fan80 → 有 aggregate；`views.length ≤ 80`  
- aggregate 的 `parentId ∈ view ids`；`representsIds ∩ view ids = ∅`  
- working clamp 后仍含 focus + 全 path  
- deep40 layout y 随 depth 严格递增  
- palette 空查询/封顶  

### 2.9 focusNode O(1)（P1，W3）

- 只 patch 目标节点 unread。

### 2.10 键盘（P1，W3）

- Focus 且非输入：`Alt+↑` 父；`Alt+↓` 首子；`Alt+[` / `Alt+]` 兄妹。  
- Map 模式忽略。复用 `isTypingTarget`。

---

## 3. 文件变更清单

| 文件 | 变更 | 节号 |
|------|------|------|
| `src/lib/mapScope.ts` | **新建** cone/working/atlas | 2.1 |
| `src/lib/mapScope.test.ts` | **新建** | 2.8 |
| `src/lib/stressSeed.ts` | **新建** | 2.8 |
| `src/lib/paletteRank.ts` | **新建** | 2.6 |
| `src/lib/paletteRank.test.ts` | **新建** | 2.6 |
| `src/lib/treeNav.ts` | collapseCrumbs；locus 辅助 | 2.4, 2.7 |
| `src/lib/treeNav.test.ts` | 扩展 | 2.7 |
| `src/lib/graphLayout.ts` | 深度迭代 + 保留字段 | 2.2 |
| `src/components/shell/GraphCanvas.tsx` | LOD + labelMode + 兼容 | 2.2 |
| `src/components/shell/MapStage.tsx` | scope/expand/DEV | 2.3, 2.8 |
| `src/components/shell/LocusPeek.tsx` | cap；文案 | 2.4 |
| `src/components/shell/LeftRail.tsx` | 未读截断 only | 2.5 |
| `src/components/shell/CommandPalette.tsx` | paletteRank | 2.6 |
| `src/components/card/CardHeader.tsx` | 面包屑折叠 | 2.7 |
| `src/styles/app.css` | role LOD | 2.2 |
| `src/state/workspaceStore.ts` | mapScopeMode（W2-B）；O(1) focus（W3） | 2.3, 2.9 |
| `知识库/docs/map-scale-lod.md` | 短备忘 | 文档 |

---

## 4. 架构图

```text
MapStage [working|cone|atlas] + expandedCaps(local)
        │
        ▼
   mapScope.ts ──► MapNodeView[] (≤80, roles)
        │
        ▼
   layoutGraph (depth iterative) ──► GraphCanvas labelMode=lod
        │
   path/focus sharp · field dim · aggregate expand

Ctrl+K ── paletteRank ── focus + mode=focus
Breadcrumb ellipsis ── expand UI only
```

---

## 5. 实施顺序

```text
Wave 1 (parallel after 01 APIs exist; 01 first if serializing lib):
  Plan 01: mapScope + stressSeed + graphLayout depth + collapseCrumbs + paletteRank + tests
  Plan 02: CommandPalette + LeftRail unread (uses paletteRank)
  Plan 03: CardHeader crumbs (uses collapseCrumbs)

Wave 2:
  Plan 04: GraphCanvas LOD + CSS (backward compatible)
  Plan 05: MapStage + LocusPeek + store mapScopeMode + DEV stress

Wave 3:
  Plan 06: focus O(1) + keyboard P1 + docs + full verify
```

| 阶段 | 任务 | 依赖 | 工作量 |
|------|------|------|--------|
| W1-A | lib 核心 | — | M–L |
| W1-B | Palette + 未读 | W1-A | S |
| W1-C | CardHeader | W1-A | S |
| W2-A | GraphCanvas LOD | W1-A | M |
| W2-B | Map/Locus/DEV/store | W1-A, W2-A | M–L |
| W3 | P1 + 文档 + 总验 | W2 | S |

**冲突裁定：**  
- `app.css`：W2-A  
- lib 文件：仅 W1-A  
- LeftRail：W1-B only  
- MapStage/Locus：W2-B  
- store：`mapScopeMode` W2-B；O(1) focus W3  

---

## 6. 验收标准

- [ ] Map 默认工作集切片；顶栏 `工作集 a · 库 b`（或锥/总览文案）  
- [ ] `stressFan(80)` 有 aggregate；`views.length ≤ 80`  
- [ ] 单测：aggregate `parentId ∈ views`；`representsIds ∩ views = ∅`  
- [ ] 单测：clamp 后含 focus + 全 path  
- [ ] `stressDeep(40)` layout y 随 depth 严格递增  
- [ ] field opacity ≤ 0.35；graph 无 `blur(`  
- [ ] lod 下 path/focus 有标签；field 无  
- [ ] 未读 ≤12 + 余数  
- [ ] Ctrl+K 空查询不倾倒全库；≤40  
- [ ] 深链 `根/…/父/当前`；ellipsis 不 focusNode  
- [ ] DEV 压测仅 DEV；build 产物无压测入口字符串  
- [ ] 点 aggregate 不改 focusId；expand 后真节点出现  
- [ ] tsc / vitest / vite build 全绿  

---

## 7. 不在范围

- WebGL/Canvas 引擎、力导向、完备 pan/zoom  
- 稳态 Gaussian blur、科幻雾  
- Agent 批次 triage、Live≤5 完整产品  
- Obsidian、universe.db、真 LLM  
- 独立 Map 路由、未读游戏化  

---

## 8. 版本变更

| 版本 | 说明 |
|------|------|
| v1.0 | 初稿 |
| v1.1 | Oracle REVISE：working clamp 算法；aggregate↔layout 契约；cone 保留全祖先；depthOf P0；GraphCanvas 兼容；DEV→MapStage；面包屑统一；paletteRank 可测 |
