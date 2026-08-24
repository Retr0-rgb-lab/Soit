# Tauri 主工作区脚手架与 Demo 落地 — Spec v1.1

> 日期: 2026-08-19  
> 依据: `知识库/docs/共识.md`、`知识库/docs/对象模型.md`、`知识库/docs/非目标.md`、`知识库/docs/explore-card-interaction.md`、`知识库/design/prototype-workspace.html`（v5）、用户拍板「启动快速 → Tauri + 薄前端」  
> 基线分支: `main` @ `7faf6d9`  
> 前置依赖: 产品共识已拍板；HTML 原型 B（Stack）已具备可迁移交互骨架  
> Oracle: APPROVE-WITH-MINOR → 已合入 v1.1  

---

## 摘要

把 Soit 从「只有 HTML 原型」推进到 **可安装/可 `tauri dev` 的本机窗口**，并按原型 B 落地主工作区前端。壳用 **Tauri 2（Rust）**，UI 用 **Vite + React + TypeScript**；启动策略是 **先出窗口与壳 UI，vault/宇宙 IO 延后**。本阶段 **不** 接真模型、不写 Obsidian 沉淀、不做完整 `universe.db` 业务，只把工程骨架、快启动路径、以及与 demo 对齐的主界面（内存态）做实，为后续 Agent/SQLite 波次留好命令边界。

---

## 0. 前置依赖

已完成：

| 项 | 位置 |
|----|------|
| 产品身份与 v1 边界 | `知识库/docs/共识.md` |
| 实体不变量 | `知识库/docs/对象模型.md` |
| 非目标 | `知识库/docs/非目标.md` |
| Explore 交互对照 | `知识库/docs/explore-card-interaction.md` |
| 可交互 HTML 原型（B=Stack） | `知识库/design/prototype-workspace.html` |

用户已认可技术方向：**Tauri + 薄前端；启动以「窗口先亮」为优先。**

---

## 1. 现状

### 1.1 仓库

- 根目录几乎无应用代码：`README.md`、`image.png`、`.gitignore`（已忽略 `node_modules/`、`dist/`、`target/`、`src-tauri/target|gen/`、`**/.soit/universe.db*`）、`知识库/`。
- **没有** `package.json`、`src-tauri/`、应用 crate、前端 `src/`。
- 原型是单文件 HTML + 内联 CSS/JS，状态全在内存；变体 A/B/C 可切换，**B 是交互真源**。

### 1.2 原型 B 已具备、须迁入真前端的能力

| 能力 | 原型表现 | 本 Spec 要求 |
|------|----------|--------------|
| 左栏 | 宇宙/vault/记忆/技能 + 探究列表；可折叠 | 迁入 |
| 中卡 | 标题、路径、卡头三钮、轮次折叠、消息、思考条 | 迁入 |
| 卡缘 | 深挖 / 发散 两钮（Soit，非 Explore 三向） | 迁入 |
| 作曲条 | 卡外；模型占位；Enter 换行 / Ctrl+Enter 发送 | 迁入 |
| 右栏 | SVG 节点图，点节点换卡 | 迁入 |
| 标注 | 下划线 hover/click → 浮层 → 深挖/发散 | 迁入 |
| 轮次条 | hover 显示：深挖/发散/收藏/重生/删轮 | 迁入 |
| 划词 | 预览方向 / 引用 / 复制 | 迁入（**可简化**但需可点） |
| 动效 | 换卡 enter、浮层 pop-in、条 fade | 迁入核心；尊重 `prefers-reduced-motion` |

### 1.3 明确尚未存在（本 Spec 只留接口，不实现业务）

- `vault/.soit/universe.db` 读写
- 真 LLM / BYOK 请求
- Obsidian `concepts/` 写出
- 技能引擎

---

## 2. 需要做的工作

### 2.1 工程脚手架（P0）

**问题：** 无标准应用入口，无法 `dev` / 打包。

**方案：**

1. 仓库根初始化（**不得**把应用塞进 `知识库/`）：
   - 前端：`package.json`、Vite、React 18+、TypeScript、严格 `tsconfig`
   - 壳：Tauri 2（`src-tauri/`），窗口标题 `Soit`；`identifier` 使用反域名（如 `lab.soit.app`）
   - capabilities：**最小权限**，仅暴露本阶段 commands
2. 脚本：
   - `npm run dev` → 仅前端（经 `host.ts` mock，见 2.2）
   - `npm run tauri dev` → 完整桌面
   - `npm run build` + `tauri build` 路径可通（CI 可后置）
3. 包管理器：**写死 npm**，提交 `package-lock.json`。`.gitignore` 已覆盖 `dist/` 与 Tauri/node 产物；仅缺口时再改。
4. 根 `README.md` 增加：
   - 环境：Rust stable、Node LTS、Windows **WebView2**
   - 如何 `tauri dev`、如何只开前端
   - 若仓库路径含 **非 ASCII** 导致工具链异常：可克隆到 ASCII 路径再开发，并以实际可跑路径验收

### 2.2 快启动契约（P0）

**问题：** 用户要的是「点开就有窗」，不是「启动时扫完宇宙」。

**硬性要求：**

| 阶段 | 允许 | 禁止 |
|------|------|------|
| 进程启动 → 首帧可见 | 创建窗口、加载**本地**前端 bundle、画壳（左/中/右骨架） | 同步扫 vault、开多个 DB、**任何**模型/鉴权网络、阻塞式全库 walk、**首屏依赖 CDN 字体/远程 CSS** |
| 首帧之后 | 异步 host API 拉状态、demo 或空态 | 把首屏卡在 splash 超过目标阈值 |

**目标（本机、冷启动、无大 vault）：**

- **P0：** 窗口「可交互壳」出现 **≤ 2.0s**。  
  **测量：** release 产物（`tauri build` 安装包或 release 可执行文件）；从进程启动到三栏壳可点击；**不计** `tauri dev`/HMR。命令、机器概况与一次实测写入 README。
- **P1：** 同条件 **≤ 1.0s**（优化目标，不阻塞本阶段）

**实现要点：**

- Rust `setup` / `main` 不 `await` 重 IO
- 前端 `main.tsx` 先 `createRoot` 渲染 `AppShell`，再用 `useEffect` 调 host API
- 新增 `src/lib/host.ts`：封装 `get_bootstrap_state` / `get_workspace_snapshot` / `select_vault`；在无 Tauri（纯 `npm run dev`）时返回内存 mock（`vault: null`, snapshot `source: "demo"`），保证 UI 可独立开发
- command：`get_bootstrap_state` → `{ phase: "ready_ui", vault: null | path, version }`（本阶段 vault 可先为 null）

### 2.3 前端信息架构（P0）

从原型 B 拆组件（名称可微调，职责不可混）：

```text
src/
  main.tsx
  App.tsx                 # 只组装；W1 建骨架，W3 可微调
  types.ts                # Wave1 冻结
  styles/
    tokens.css
    app.css
  state/
    workspaceStore.ts     # 公共 API 见下（Wave1 冻结）
  components/
    shell/AppShell.tsx
    shell/LeftRail.tsx
    shell/RightGraph.tsx
    card/InquiryCard.tsx
    card/CardHeader.tsx
    card/TurnList.tsx
    card/TurnItem.tsx
    card/EdgeActions.tsx
    card/Composer.tsx
    overlays/TermFloat.tsx
    overlays/DirectionChooser.tsx
    overlays/SelectionBar.tsx
    overlays/Tooltip.tsx
  lib/
    host.ts
    graphLayout.ts
    marks.ts
```

**Wave1 必须冻结的 store 公共 API（名称可微调，语义不可缺）：**

- `loadSnapshot`
- `focusNode`
- `spawnDeepen` / `spawnDiverge`
- `regenerateTurn`
- `deleteTurn`
- `toggleTurnCollapsed`
- `appendUserMessage`

W2-B **只消费** store API，不改图布局算法。

**状态语义（demo 子集，非 `universe.db` 定稿）：**

- 节点：`id, title, parentId, kind: root|deepen|diverge, unread`
- 对象模型中的 `status` / `question` / `stuck` / `next` / timestamps 本阶段可省略或硬编码占位，**不**落库
- 边：仅深挖/发散（由 parent + kind 表达即可）
- 轮次：属 cardId；`collapsed`；user/ai/think 或等价 messages
- 分叉：深挖/发散创建子节点并 focus；重生只改当前轮
- **卡头三钮**（深挖/收藏/删除）：P0 可 UI + tooltip；**删除不级联、不落盘**；不得声称已持久化删子树（对象模型：删除规则未定）

**变体 A/C：** 本阶段 **不做**。HTML 原型保留作参考，不要求运行时加载该 HTML。

### 2.4 视觉与动效（P0 最小 / P1 增强）

- 延续原型暖纸色（非 Explore 粉彩）
- **字体：** P0 用系统栈或打包到 `public/fonts` 的子集；**禁止**首屏请求 `fonts.googleapis.com`（与研究用 HTML 脱钩）
- 必须：`prefers-reduced-motion` 下调大动画
- P0 动效：换卡 enter、浮层 pop-in、轮次工具条 fade
- P1：节点未读脉冲、叠层 card-pulse

### 2.5 Rust command 边界（P0 桩）

| Command | 行为 |
|---------|------|
| `get_bootstrap_state` | 立即返回 UI 可启动信息（无重 IO） |
| `ping` | 可选健康检查 |
| `select_vault` | **桩**：校验路径存在；**仅内存**记下 path，不建 db；`{ ok, path, error? }` |
| `get_workspace_snapshot` | **桩**：未选 vault → 内置 demo（`source: "demo"`）；已选 → demo 或空（`source: "demo" \| "empty"`） |

**禁止** command 内：schema 迁移、拉模型、递归扫 vault 全文。

### 2.6 种子数据（P0）

与原型同构的 demo 宇宙（线性代数 → 范畴论 → 函子 等），**无 vault 也能演示** 主循环。

### 2.7 质量与工程卫生（P0）

- TypeScript `strict`
- ESLint 基础可跑
- 至少一个冒烟测试（二选一）：Vitest（`graphLayout` 或 store 分叉）或 `cargo test`（bootstrap 立刻返回）
- README：dev 步骤、WebView2、路径注意、一次 release 启动实测

---

## 3. 文件变更清单

| 文件 | 变更 | 节号 |
|------|------|------|
| `package.json` / `package-lock.json` | 新建 | 2.1 |
| `vite.config.ts` | 新建 | 2.1 |
| `tsconfig*.json` | 新建 | 2.1 |
| `index.html` | 新建 | 2.1 |
| `src/**` | 新建 React 应用 | 2.2–2.4 |
| `src-tauri/**` | 新建 Tauri 2 + commands | 2.1, 2.2, 2.5 |
| `README.md` | dev / 启动 / 环境 | 2.1, 2.2 |
| `.gitignore` | 仅缺口时补 | 2.1 |
| `知识库/design/prototype-workspace.html` | **不改** | — |

---

## 4. 架构图

```text
┌─────────────────────────────────────────────────────────┐
│  OS Window (Tauri WebView)                              │
│  ┌─────────┬──────────────────────────┬──────────────┐  │
│  │ LeftRail│ InquiryCard + Composer   │ RightGraph   │  │
│  │         │ (React store)            │              │  │
│  └─────────┴────────────▲─────────────┴──────────────┘  │
│                         │ host.ts (invoke | mock)       │
└─────────────────────────┼───────────────────────────────┘
                          │
              ┌───────────▼───────────┐
              │  Rust commands        │
              │  bootstrap / vault桩  │
              │  no heavy IO on boot  │
              └───────────────────────┘

Cold start:
  main() → show window → local index.html → React paint shell
        → useEffect → get_bootstrap_state (async)
```

---

## 5. 实施顺序

| 阶段 | 任务 | 依赖 | 工作量 | 并行 |
|------|------|------|--------|------|
| W1-A | Tauri+Vite+React 脚手架、README、lockfile | — | S | 先于 W1-B |
| W1-B | tokens + AppShell 空壳 + host.ts + bootstrap commands + 冻结 types/store API | W1-A | S | — |
| W2-A | workspaceStore 实现 + 种子 + LeftRail + RightGraph + graphLayout | W1-B | M | 与 W2-B 并行 |
| W2-B | InquiryCard 全套；划词条可简化 | W1-B | **M–L** | 与 W2-A 并行 |
| W3 | 动效、reduced-motion、冒烟测试、启动实测笔记 | W2-A/B | S | — |

```text
Wave 1 (sequential): Plan scaffold → Plan shell-bootstrap
Wave 2 (parallel):   Plan store-graph  ||  Plan inquiry-card
Wave 3 (sequential): Plan polish-verify
```

**文件冲突规避：**

- W2-A：`state/`、`LeftRail`、`RightGraph`、`graphLayout.ts`
- W2-B：`card/`、`overlays/`
- `App.tsx`：W1 骨架，W3 可调；W2 双方不抢写业务逻辑进 App
- Wave1 冻结 `types.ts` + store 公共 API

W2-B 简化顺序（若超时）：SelectionBar 保底可点 → TermFloat → 轮次 chrome 完整度。

---

## 6. 验收标准

- [ ] `npm install` 后 `npm run tauri dev` 能开出标题为 Soit 的窗口  
- [ ] 首屏可见左/中/右壳，**不**依赖先选 vault  
- [ ] 无 vault 时有 demo 宇宙，可：点节点换卡、深挖/发散长卡、下划线浮层选方向、作曲条发送（内存）  
- [ ] 换卡/长卡后左列表与右图与标题路径一致  
- [ ] 重生不新增节点；深挖/发散新增节点  
- [ ] `get_bootstrap_state` / 首屏路径无重 IO；纯 `npm run dev` 下 mock host 可渲染 demo  
- [ ] 冷启动 Network 抽查：首屏**不**拉取 CDN 字体  
- [ ] `select_vault` 桩：不存在路径 `ok: false`；存在则内存记下 path，不建 db  
- [ ] `prefers-reduced-motion: reduce` 下无强制大动画  
- [ ] 至少 1 个自动化冒烟测试通过  
- [ ] README：WebView2、环境、路径注意、release 启动实测（是否 ≤2s）  
- [ ] 无 Electron；无云登录墙  

---

## 7. 不在范围

- 真 LLM / BYOK  
- `universe.db` schema 定稿与迁移  
- Obsidian 概念页/残渣写出  
- 技能加载与执行  
- 变体 A/C、主题系统、i18n  
- 自动更新、签名、完整 CI  
- Explore 第三种「分支卡」、思维宇宙  
- 生产入口继续维护 HTML 双轨  

---

## 8. 风险

| 风险 | 缓解 |
|------|------|
| Windows WebView2 / 工具链不齐 | README 写清；W1 先跑通 |
| 仓库路径含中文等非 ASCII | README 写明；失败则 ASCII 旁路 |
| 从原型照搬 Google Fonts | tokens 只用本地/系统字体 |
| W2 并行改 store 形状 | W1 冻结 store API；W2-B 只读 API |
| 追求 1s 启动过早优化 | P0 收 2s；1s 为 P1 |
| demo 与未来 DB 漂移 | demo 子集标明；`source` 字段 |
| W2-B 膨胀 | 划词可简化；简化顺序写明 |

---

## 9. 版本变更

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-08-19 | 初稿 |
| v1.1 | 2026-08-19 | Oracle APPROVE-WITH-MINOR：冷路径禁 CDN 字体、host mock、W2 store API 冻结、WebView2/非 ASCII、验收与风险补强、W2-B 工作量 M–L |
