# 工作区门厅（选择 → 进入）— Spec v1.1

> 日期: 2026-08-20  
> 依据: `知识库/docs/共识.md`（本机 Host、一 vault 一宇宙）；`知识库/docs/对象模型.md`；`知识库/docs/非目标.md`；设计备忘（方案 1）；用户拍板 **按推荐**：冷启动停门厅(1A)、recents≤8(2B)、路径先手贴(3A)；Oracle REVISE → v1.1  
> 基线分支: `main`  
> 前置依赖: `open_universe` / `close_universe` / `lastVault`（`soit-session.json`）；`AppShell`；`SpaceSection`；`EmptyWorkspace`；bootstrap 不开 DB

---

## 摘要

今日冷启动直接进三栏壳，有 `lastVault` 则静默开库；未绑定则空壳 +「打开设置 · 空间」贴路径；「离开」= 设置里解绑，人不回「家」。本 Spec 引入 **门厅（选择工作区）** 与 **屋子（已进入宇宙）** 两顶层画面：用户先选本机 vault，再点进入；屋子内显式 **退出工作区** 回门厅。同时最多一个打开的宇宙；先关后开；session 以 Host 为权威；enter/leave 用 navEpoch 对齐，禁止 Host 开库而 FE 停门厅。

---

## 0. 前置依赖

| 已有 | 说明 |
|------|------|
| `get_bootstrap_state` | 返回 `vault` / `lastVault`；**不开** universe.db |
| `open_universe` / `close_universe` | 开库写 lastVault；关库 **不清** lastVault |
| `get_last_vault` / `set_last_vault` | `session_config.rs` → `soit-session.json`（今日仅 lastVault） |
| `App.tsx` 冷启动 | 有 lastVault 则 `openUniverse` 静默恢复（本 Spec 删除） |
| `beginBootLoad` + `loadSnapshot(_, epoch)` | 挡 FE 写图；**不**自动关 Host DB（本 Spec 补齐） |
| `AppShell` | 始终挂三栏；空图 → `EmptyWorkspace` |
| `SpaceSection` | 路径输入、打开/更换、解绑、清除上次（私有 busy 管道，本 Spec 收口） |
| 未绑定 CTA | EmptyWorkspace、OpenDocPopover、MaterialsRail、SkillsList |
| 共识 | 本机、非云、冷启动无库全扫 |

---

## 1. 现状

### 1.1 用户路径

| 步骤 | 今天行为 | 问题 |
|------|----------|------|
| 冷启动 | 先画 `AppShell`；有 lastVault 静默 open | 无「选择」感；失败则空壳 |
| 首次绑定 | 空壳 → 设置 · 空间 → 手贴路径 | 门藏在设置里 |
| 离开 | 设置 · 解绑 → 仍在三栏空壳 | 离开 ≠ 回家 |
| 多库 | 只记 1 个 lastVault | 无最近列表 |
| 空库 | Empty 兼「未绑定」与「空宇宙」 | 两态混页 |
| HMR | Host 可能仍 bound，FE 重载 | 与「总是门厅」冲突 |

### 1.2 代码锚点

| 文件 | 角色 |
|------|------|
| `src/App.tsx` | boot + 静默 open |
| `src/state/workspaceStore.ts` | epoch / loadSnapshot / vaultPath |
| `src/components/shell/AppShell.tsx` | 唯一顶层壳 |
| `src/components/shell/EmptyWorkspace.tsx` | 空图 CTA |
| `src/components/shell/settings/SpaceSection.tsx` | 绑定/解绑私有管道 |
| `src/components/doc/OpenDocPopover.tsx` | 未绑定 → 设置·空间 |
| `src/components/shell/MaterialsRail.tsx` | 未绑定引导 |
| `src/components/shell/settings/SkillsList.tsx` | 「去绑定本库」 |
| `src-tauri/src/session_config.rs` | 仅 lastVault |
| `src-tauri/src/lib.rs` | open 写 last；close 不清 |

### 1.3 产品锁定

1. **方案 1：** 独立门厅 + 屋子内「退出工作区」。  
2. **冷启动 1A：** 总是门厅；预选 lastVault；用户点「进入」——**不**自动 open。  
3. **Recents 2B：** 最多 8 条；不扫盘。  
4. **路径 3A：** 手贴绝对路径；文件夹对话框 P2。  
5. **一库一宇宙；** switch = 先关后开。  
6. **空库** = 屋子内态；未绑定不得靠空壳当门厅。  
7. **浏览器 v1：** 无演示宇宙入口；真库需桌面版。

---

## 2. 需要做的工作

### 2.1 顶层导航态（P0）

FE **`shellPhase`**（`workspaceStore` 持有；逻辑可拆 `spaceNav.ts` / `spaceActions.ts`），与 `workspaceMode`（focus/map）正交。默认 **`picker`**。

| 态 | 含义 | 画什么 |
|----|------|--------|
| `picker` | 门厅 | `WorkspacePicker` 全屏 |
| `entering` | 打开中 | 门厅 + busy（取消按钮 **P1 可选**） |
| `workspace` | 已进入 | `AppShell` 三栏 |
| `leaving` | 关闭中 | 三栏锁定 + 短文案 |
| `error` | open 失败 | **同一** WorkspacePicker + 错误（或 `picker` + `enterError` 字段，实现二选一） |

```text
冷启动 → picker
picker --enter/addAndEnter--> entering --ok--> workspace
entering --fail--> error（叠门厅）
entering --cancel--> picker   # P1 可选；语义 = 丢弃 navEpoch + 必要时 close
error --retry--> entering
error --dismiss--> picker
workspace --leave--> leaving --ok--> picker
workspace --switch--> leaving → entering（同一事务串行）
```

**不变量**

1. `workspace` ⇔ FE `vaultPath` 非空且 `source ∈ {"empty","universe"}`，且 Host 侧有打开的 universe。  
2. `picker` / `error`：`vaultPath === null`，图为 `unboundEmptySnapshot()`（source demo + **空节点**），**禁止** product 灌 demo 卡。  
3. 同时最多一个 space 导航事务。`spaceBusy` 或 `shellPhase ∈ {entering, leaving}` 时忽略重复请求；UI disabled。  
4. 所有 enter/leave/switch/cancel 使用 `beginBootLoad()`（navEpoch）。  
   - `loadSnapshot(snap, epoch)` 仅当 epoch 仍为当前。  
   - 若 `open_universe` 返回时 epoch 已过期且 `res.ok`：必须 `close_universe`（或确认 Host 当前 path 仍等于本事务 path 才 apply）。**禁止** Host 开库 + FE 停门厅。  
5. `leave` / `close_universe` **不清** `lastVault`。清 last 仅：用户「清除记忆」、或 `forget(path)` 且 path 为当前 lastVault。  
6. open **成功**（事务未过期）→ **Host** 写 `lastVault` + `push_recent(canonicalPath)`；FE **只** `getSessionConfig` 刷新，不本地双写权威副本。  
7. 门厅零 vault 扫描、零冷启动开 DB；若 boot 时 Host 已 bound → **先 close** 再停 picker（§2.4）。  
8. `cancel entering`（若实现）= 丢弃 navEpoch + 必要时 close；**不是** abort IPC。

### 2.2 Session 配置扩展（P0）

```ts
interface SessionConfig {
  version: 1;
  lastVault: string | null;
  recentVaults: string[]; // 新在前，≤8，绝对路径去重
}
```

**迁移：** 缺 version / 仅 lastVault → `recentVaults = lastVault ? [lastVault] : []`；normalize 截断 8、去重保序。

**Host 权威**（`soit-session.json`）

| 命令/路径 | 行为 |
|-----------|------|
| `get_session_config` | 读 + migrate |
| `set_session_config` | 全量 normalize 后写 |
| `get_last_vault` / `set_last_vault` | **保留**；`set(Some(p))` → last=p + push_recent(p)；`set(None)` → **只** last=null，recents 不变 |
| `open_universe` 成功 | lastVault = canonical path；push_recent(path) |

**FE**

- `host.getSessionConfig` / `setSessionConfig`  
- `src/lib/sessionConfig.ts`：normalize / pushRecent / removeRecent / migrate + 单测  
- 浏览器：`localStorage` 键 `soit-session` 整份；`openUniverse` 仍失败  
- **浏览器 v1 不提供「进入演示宇宙」**；主 CTA「需要桌面版」

**冷启动读路径（锁定）：** App 调 `getSessionConfig()` 取 last+recents；`getBootstrapState` 仅用于探测 `boot.vault` 是否需 close。不把两套 last/recents 源并行发明。

### 2.3 门厅 UI（P0）

`src/components/shell/WorkspacePicker.tsx` + CSS（tokens，无 CDN 字体）。

**看见**

- 标题：「选择工作区」  
- 列表：recent 卡片（文件夹名 + 截断路径）；last 角标「上次」  
- 空列表：「还没有工作区。打开一个 Obsidian 库文件夹即可。」  
- 无三栏 / 探究卡 / 资料轨  

**主按钮**

- 有选中：「进入」  
- 列表空：「打开本机文件夹」（路径表单）  

**次要**

- 「打开本机文件夹」：手贴绝对路径 → enter（成功后 Host 写 recents）  
- 卡片 ⋯：「从列表移除」→ forget  
- 浏览器：真库 disabled +「需要桌面版」  
- 门厅内设置齿轮：**P2**（v1 不做）  

**进入失败：** 横幅/卡片错误 + 重试 / 移除。

### 2.4 冷启动 / App 根（P0）

1. store 默认 `shellPhase = "picker"`；首帧 **不**先挂 AppShell 再闪三栏。  
2. boot：  
   a. `epoch = beginBootLoad()`  
   b. `boot = getBootstrapState()`；若 `boot.vault` → `await closeUniverse()`（失败：门厅错误条）  
   c. `session = getSessionConfig()`  
   d. **禁止** `openUniverse(lastVault)`  
   e. Picker 预选：`selectedPath = lastVault ?? recentVaults[0] ?? null`（组件 local state）  
   f. `setVaultPath(null)`；`loadSnapshot(unboundEmptySnapshot(), epoch)`  
3. 挂载：  
   - `phase ∈ {picker, entering, error}` → `WorkspacePicker`  
   - `phase ∈ {workspace, leaving}` → `AppShell`  
4. 删除今日静默 open 分支；改掉 AGENTS「boot 可 open lastVault」表述。

### 2.5 进入 / 退出 / 切换（P0）

实现优先拆到 `src/state/spaceNav.ts` 或 `spaceActions.ts`，store 暴露方法，控制 `workspaceStore` LOC。

共用：space 事务互斥；每次动作 `beginBootLoad()` → epoch。

| 动作 | 步骤 |
|------|------|
| `enter(path)` | busy 则忽略；phase=entering；若已有不同 vault → close；`openUniverse`；epoch 过期且 ok → close 并 return；fail → error + vaultPath=null；ok → setVaultPath(res.path) + loadSnapshot + refresh session + phase=workspace |
| `leave()` | 非 workspace 或 busy 忽略；phase=leaving；`closeUniverse` 失败 → 回 workspace + error；ok → vaultPath=null + unbound empty + phase=picker（**不清** lastVault）。推荐卸载 AppShell 丢 settings/palette 本地 state |
| `switch(path)` | 与当前 canonical 相同则忽略；同一事务 leave 语义（可不闪 picker）再 enter |
| `forget(path)` | 只改 session；path===last → last=null |

**路径：** open 后必须以 `res.path` 入 recents；FE 比较前 trim；switch 去重信任 Host 返回 path。

**退出入口 P0**

- 左轨品牌区：当前库 **leaf 名** +「退出工作区」  
- `SpaceSection`：「解绑」→「退出工作区」= `leave()`  

**SpaceSection / LeftRail 只调上述 API**，禁止组件内私有 open/close 成功路径。`phase ∈ {entering, leaving}` 时绑定控件 disabled。

### 2.6 EmptyWorkspace / SpaceSection / CTA（P0）

| 组件 | 变更 |
|------|------|
| `EmptyWorkspace` | 仅 vault 已绑且空图；**删除**「打开设置 · 空间」 |
| `SpaceSection` | 管家：路径、徽章、switch、清除记忆、leave；「使用记住的库」= switch(last) 或引导出门厅，勿双开 |
| `OpenDocPopover` | 未绑定兜底：提示门厅 / leave，不把设置·空间当唯一门 |
| `MaterialsRail` | 同上 |
| `SkillsList` | 「去绑定本库」不得只跳设置·空间当门厅 |

### 2.7 单测与文档（P0/P1）

| 测 | 内容 |
|----|------|
| `sessionConfig.test.ts` | migrate、push 截断 8、remove 清 last |
| spaceNav / store 测 | enter fail；leave 不清 last；switch 先关；**stale open → close**；SpaceSection 不双开 |
| boot | Host vault non-null → close then picker；无静默 open |

AGENTS：`src` / `shell` / `lib` / `src-tauri` 补门厅契约。  
**P1：** `知识库/docs/共识.md` 一句「门厅选库 / 屋子探究」。

---

## 3. 文件变更清单

| 文件 | 变更 | 节 |
|------|------|-----|
| `src-tauri/src/session_config.rs` | SessionConfig + recents + get/set session | 2.2 |
| `src-tauri/src/lib.rs` | open push recent；注册命令 | 2.2 |
| `src-tauri/permissions/*` + `capabilities/default.json` | 新命令权限 | 2.2 |
| `src/lib/sessionConfig.ts` + `.test.ts` | 纯函数 | 2.2 |
| `src/lib/host.ts` | get/set session；浏览器 LS | 2.2 |
| `src/types.ts` | SessionConfig | 2.2 |
| `src/state/spaceNav.ts`（或 spaceActions） | enter/leave/switch | 2.5 |
| `src/state/workspaceStore.ts` (+ test) | shellPhase + 暴露动作 | 2.1 2.5 |
| `src/App.tsx` | boot close；phase 挂载 | 2.4 |
| `src/components/shell/WorkspacePicker.tsx` | 门厅 | 2.3 |
| `src/components/shell/LeftRail.tsx` | 库名 + 退出 | 2.5 |
| `src/components/shell/EmptyWorkspace.tsx` | 去未绑定 CTA | 2.6 |
| `src/components/shell/settings/SpaceSection.tsx` | leave/switch 收口 | 2.6 |
| `src/components/doc/OpenDocPopover.tsx` | CTA | 2.6 |
| `src/components/shell/MaterialsRail.tsx` | CTA | 2.6 |
| `src/components/shell/settings/SkillsList.tsx` | CTA | 2.6 |
| shell/styles | 门厅样式 | 2.3 |
| `src/**/AGENTS.md`、`src-tauri/AGENTS.md` | 契约 | 2.7 |
| `知识库/docs/共识.md` | P1 一句 | 2.7 |

---

## 4. 架构图

```text
                    ┌─────────────────┐
   cold start       │  picker (门厅)   │◄──────── leave 完成
   close if bound   │  recents ≤ 8    │
   no open DB ──────►│  预选 lastVault │
                    └────────┬────────┘
                             │ enter (navEpoch)
                             ▼
                    ┌─────────────────┐
                    │    entering     │──fail──► error on picker
                    │ stale ok→close  │
                    └────────┬────────┘
                             │ open ok + epoch live
                             ▼
                    ┌─────────────────┐
                    │ workspace 屋子  │  AppShell
                    │ 退出工作区      │──► leaving ──► picker
                    └─────────────────┘
```

---

## 5. 实施顺序

| 阶段 | 任务 | 依赖 | 工作量 |
|------|------|------|--------|
| **W1** | **H1** sessionConfig FE+Rust recents | 无 | S |
| **W2** | **H2** shellPhase + enter/leave/switch + epoch/Host 对齐单测 | H1 | M–L |
| **W3** | **H3** WorkspacePicker + App 冷启动挂载 | H2 | M |
| **W4** | **H4** LeftRail 退出、SpaceSection 收口、Empty/Materials/OpenDoc/Skills CTA | H3 | M |
| **W5** | **H5** AGENTS + 共识一句 + test/build 验收 | H4 | S |

**Wave：** 全部 **串行** H1→H2→H3→H4→H5（争用 App/store/shell）。  
H2 验收必须含：stale open → close；boot.vault → close；无 SpaceSection 双开。

---

## 6. 验收标准

- [ ] 冷启动首屏门厅，**不**静默 `open_universe`  
- [ ] 有 lastVault 时预选中；点「进入」才开库  
- [ ] open 成功进三栏；失败留门厅可重试  
- [ ] 「退出工作区」回门厅；lastVault 仍在  
- [ ] recents ≤8、去重、置顶；移除不删磁盘  
- [ ] 空库只「新建根探究」；无设置·空间当回家  
- [ ] 左轨与 SpaceSection 退出同一管道  
- [ ] 换路径先关后开；无双宇宙  
- [ ] FE HMR/boot 时 Host 已 open → 先 close 再门厅  
- [ ] 快速连点进入/立刻退出：不会 Host 开库而 phase=picker  
- [ ] open 成功后 path 以 Host canonical 为准  
- [ ] 浏览器不写假绑定；无演示宇宙入口  
- [ ] MaterialsRail / OpenDocPopover / SkillsList 不再把设置·空间当唯一门厅  
- [ ] `npm test` + `npm run build` 绿；Rust session 测绿  
- [ ] 无云 / 无扫盘 / 无左轨多库 tab  

---

## 7. 不在范围

- 系统文件夹对话框（P2）  
- 冷启动自动进入 / 倒计时取消  
- 浏览器演示宇宙冒充 workspace（v1）  
- 取消进行中的 open_universe IPC（仅 discard + close）  
- 冷启动恢复「未关库会话」进屋子（否决；始终门厅）  
- 云同步、团队空间、合并 vault、多窗多宇宙  
- 左轨工作区切换器、顶栏库 tab、设置第二门厅  
- 冷启动扫盘发现全部 Obsidian 库  
- 退出 = 删 `.soit/` 或文件夹  
- 桌面 demo 卡冒充已进入  
- 门厅内设置齿轮（P2）  

---

## 8. 版本变更

| 版本 | 说明 |
|------|------|
| v1.0 | 初稿：门厅 + 退出；1A/2B/3A；H1–H5 |
| v1.1 | Oracle REVISE：navEpoch/Host 对齐、boot.vault close、session 单写者、全局 space 忙闸、砍浏览器 demo、CTA 全清单、波次串行与 H2/H4 工作量修正 |
