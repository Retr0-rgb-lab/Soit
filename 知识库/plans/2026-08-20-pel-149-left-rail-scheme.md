# PEL-149 左侧栏优化 — 调研回收 + 方案

> Linear: [PEL-149](https://linear.app/pelec/issue/PEL-149/左侧栏优化)  
> 日期: 2026-08-20  
> 状态: **方案待用户拍板后实现**  
> 调研来源: LeftRail 代码审计 subagent（完成）+ React Bits 三组件官方页 Props/交互抽取（主代理补完；旧 RB 调研 agent 超时已 kill）

---

## 0. Issue 原意（压缩）

- 左栏观感/结构太像 Notion 列表，太平庸。  
- 去 React Bits 看 **Option Wheel / Accordion Gallery / Depth Carousel** 找灵感。  
- 用户具象设想：借鉴 Option Wheel，做成**多层同心圆**；圆心=根卡；同层露出 ≈ wheel 布局；深挖在根之下同层次展开；多 wheel **叠**在一起。

---

## 1. 现状左栏（审计回收）

### 1.1 IA（上→下）

| 区 | 作用 | 问题 |
|----|------|------|
| 品牌 + 折叠 | Soit / 探究 | OK |
| 本库 | vault bind | `prompt` 粗；占纵向空间 |
| 图谱 / 跳转 / 技能 | 动作 | 技能命名可接受；偏工具条 |
| **活线** | 注意力 pin（根） | 扁列表 |
| **最近** | MRU 卡 | 不足 5 条时用节点数组填充 → 假最近 |
| **线债** | 按根未读 | 第三套列表，与活线关系不清 |
| 脚注 | source + 卡数 | OK |

折叠态：只剩图谱 + Ctrl+K，注意力信号全丢。

### 1.2 数据其实够用

已有：`parentId` / `kind` / `focusId` / `liveIds`(根) / `recentIds`(卡) / `unread` / `edges` / `locusNodes`·`mapConeNodes` / caps。  
缺：极坐标布局 helper、FE 时间戳、轨内聚合 `+N`。

### 1.3 硬约束（不可破）

- 左栏 = **导航 + 注意力 + 本库**，不是第二 MindScape / 可编辑宇宙。  
- 结构图已有：右 Locus + Map；左不要再做全量 atlas。  
- 活线 ≠ 探究 status。  
- 仅 deepen | diverge。  
- 命名围栏：本库 / 活线 / 移出活线；禁「宇宙/记忆库/技能市场」。  
- 宽度今日 `--rail-w: 200px`；真·多环带字需加宽或叠层，不能硬塞满标签。

---

## 2. React Bits 三组件结论

### 2.1 Option Wheel — **左栏主隐喻来源 · 分 5/5**

| 项 | 内容 |
|----|------|
| 隐喻 | 贴在容器一侧的**弧形选项轮**：中间项最大/最清晰，上下渐隐模糊；拖拽/滚轮/方向键选中 |
| 关键 props | `items[]`, `defaultSelected`, `onChange`, `side: left\|right`, `curve`, `tilt`, `blur`, `fade`, `spacing`, `fontSize`, `smoothing`, `loop`, `draggable` |
| 强项 | 「环上兄弟项」选择；与「圆心 + 露出扇区」高度同构；桌面滚轮友好 |
| 弱项 | 官方单环、长标题吃力、项太多拥挤；多同心环需**自研叠层**，非开箱 |
| Soit 映射 | 圆心/焦点 = 当前根或 focus；环上 = 同父兄弟或子卡；深挖/发散用 kind 色/角标区分 |

**多环叠法（用户设想，方案采纳）：**

```text
        ╱ outer: 更深一层子卡（cap） ╲
       │   ╱ mid: 当前层兄弟 wheel ╲   │
       │  │     ● 焦点/根          │  │
       │   ╲ mid wheel            ╱   │
        ╲ outer（部分露出）        ╱
              ↑ 垂直略错开叠放，非全圆占满 200px
```

- **Ring 0（中心）**：当前活线根或 focus 所在根（大号 chip）。  
- **Ring 1**：该根下 **direct children**（深挖/发散混排，kind 编码）。  
- **Ring 2+**：仅当 focus 已下钻时，显示 focus 的 children；外环更淡、更短弧、更少项（cap 如 5–7）。  
- 交互：滚轮/拖 = 同环选择；**点中心或双击** = 回到根；点外环项 = `focusNode`；长按/次级 = pin 活线。  
- **禁止**自由平移缩放画布（防 MindScape）。

### 2.2 Accordion Gallery — **分区外壳 · 分 3.5/5**

| 项 | 内容 |
|----|------|
| 隐喻 | 多面板手风琴；展开占大比例，其余压缩；可灰阶/3D tilt；依赖 **GSAP** |
| 关键 props | `items[{image,label}]`, `orientation: h\|v`, `expandRatio`, `trigger: hover\|click`, `grayscale`, `parallax`, `tilt`, `duration`… |
| 强项 | 「一段展开、其余让位」适合 **活线 / 最近 / 线债** 三大区，告别三套永远展开的扁列表 |
| 弱项 | 官方偏**图片画廊**；左栏若硬上大图会轻浮；GSAP 新依赖要评估体积 |
| Soit 用法 | **结构借用、皮肤自研**：竖向 accordion，panel = 活线｜结构环｜线债；展开内容可是 wheel 而非图片 |

### 2.3 Depth Carousel — **左栏慎用 · 分 2/5（中心区 4/5）**

| 项 | 内容 |
|----|------|
| 隐喻 | 卡片 Z 向堆叠透视；前卡清晰后卡模糊后仰；GSAP 导航 |
| 关键 props | `depth`, `spread`, `tilt`, `visibleCards`, `falloff`, `blur`, `onChange`… |
| 强项 | 「深度/堆叠」叙事漂亮 |
| 弱项 | **与中心 inquiry 纸栈高度撞车**；左栏 200px 放 300×380 级卡不现实；易变成第二主舞台 |
| Soit 用法 | **不要**做左栏主控件；若用，仅「最近」极简缩略条（小尺寸、无 autoplay），或留给日后中心/回看模式 |

---

## 3. 推荐方案（合成）

### 3.1 一句话

> **左栏 = 竖向手风琴分区 + 主区「多层 Option-Wheel 弧」导航注意力与局部树；图谱仍在右/Map；不做第二宇宙。**

### 3.2 信息架构（目标）

```text
┌ 本库（单行，弱化）─────────────┐
│ 活线 ▾  （accordion 默认开）    │  ← 最多 LIVE_MAX 根，可 pin/unpin
│  [ 多层弧 wheel / 同心露出 ]   │  ← 主视觉：当前根的局部树
│ 最近 ▸  （默认合，真 MRU）     │  ← 删假 padding；可选微型 stack 非 depth-carousel
│ 线债 ▸  （热度挂到根上优先）   │  ← 列表降级为 badge；展开才是明细
│ 图谱 · 跳转 · 技能（底动作）   │
└────────────────────────────────┘
```

### 3.3 主控件：`FocusOrbit`（自研，灵感 Option Wheel）

| 规则 | 说明 |
|------|------|
| 数据 | `rootOf(focus)` + children by `parentId`；可选 `mapConeNodes` cap |
| 几何 | **侧贴弧**（`side: left` 轮贴在轨内右侧靠卡片），非占满的 360° 曼陀罗 |
| 多层 | 最多 2–3 环；外环 `curve/fade/blur` 更强、字更小、项 cap |
| 深挖 | 与父同「深度叙事」：偏下半弧或内环 |
| 发散 | 偏侧弧 / 另一色相，强调平行 |
| 点击 | `focusNode(id)` only |
| 动效 | rAF 平滑（可参考 Line Sidebar / Option Wheel 的 smoothing）；`prefers-reduced-motion` → 直列表降级 |
| 无障碍 | 环模式 + 键盘列表 fallback（arrow/enter）双模 |

### 3.4 Accordion 分区（自研轻量，不引入 GSAP 除非必要）

- 用 CSS grid `0fr/1fr` 或已有 motion token，**避免**为左栏强上 GSAP。  
- 若后续要视差再评估 gsap 体积。

### 3.5 明确不做（本 issue）

- 左栏 Depth Carousel 主浏览  
- 可编辑全图、拖拽改 parent  
- 宇宙/记忆一级入口  
- 假「最近」填充  

### 3.6 分阶段交付

| Phase | 内容 | 验收 |
|-------|------|------|
| **P0** | 修 IA：去 recent padding；线债 badge 挂活线根；本库单行；折叠态显示 live/unread 角标 | 不再像三截 Notion 列表 |
| **P1** | `FocusOrbit` 单环（Option Wheel 侧弧）：当前根的 children | 点选 focus；深挖/发散可辨 |
| **P2** | 双环/三环同心露出 + accordion 分区动效 | 下钻外环；滚轮换项 |
| **P3**（可选） | 入边 tooltip；collapsed HUD 打磨 | 不挡 Map/Locus |

### 3.7 文件影响（预估）

| 路径 | 变更 |
|------|------|
| `src/components/shell/LeftRail.tsx` | 重组 IA，挂 Orbit |
| `src/components/shell/FocusOrbit.tsx` | **新建** 多层侧弧 |
| `src/components/shell/FocusOrbit.css` | 几何与动效 |
| `src/lib/orbitLayout.ts` | **新建** parent→rings 纯函数 + 单测 |
| `src/styles/tokens.css` | 可选 `--rail-w` 220–240 |
| `src/styles/app.css` | 旧 list 样式收敛 |
| 不改 | MapStage / Locus 职责；universe schema |

### 3.8 风险

| 风险 | 缓解 |
|------|------|
| 变成第二张图 | 只读、cap、无 pan-zoom 编辑 |
| 200px 放不下 | 侧弧+省略+加宽 token；外环无长文案 |
| 与 Locus 重复 | Locus=全局邻域缩略；Orbit=活线根下的选择器；文案区分 |
| 动效眩 | reduced-motion 列表 fallback |
| GSAP 体积 | P1–P2 不用 GSAP |

---

## 4. 建议用户拍板的 3 个问题

1. **轨宽**：维持 200px 抽象弧，还是默认加到 ~240px？  
2. **中心语义**：圆心固定「活线根」还是「当前 focus 卡」？（推荐：默认活线根，focus 在子树内时外环跟 focus）  
3. **P0 是否先合并 IA 清理再上 Orbit？**（推荐是，降低一次 PR 风险）

---

## 5. 调研资产状态

| 来源 | 状态 |
|------|------|
| LeftRail 审计 subagent | ✅ 全文已回收（见上 §1） |
| Option Wheel 旧 agent | ❌ 超时 kill；✅ 主代理官方页补完 |
| Accordion Gallery 旧 agent | ❌ 超时 kill；✅ 主代理官方页补完 |
| Depth Carousel 旧 agent | ❌ 超时 kill；✅ 主代理官方页补完 |
| 重派的 3 个 RB agent | 可忽略/取消，避免重复 |

---

**下一步（你点头后）:** 按 P0 → P1 开工；或你指定先做同心环视觉 spike。
