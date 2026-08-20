# 设置壳与空间管理 — Spec v1.1

> 日期: 2026-08-20  
> 依据: 三路设置面审计；`知识库/docs/共识.md` / `非目标.md`；`2026-08-20-host-hardening-and-durability.md`；用户愿景「卡页极简、左栏 Option Wheel、其余进设置」；Oracle REVISE → v1.1  
> 基线分支: `main`  
> 前置依赖: Host 耐久 G1–G4；无 `tauri-plugin-dialog`（v1 空间绑定 = 绝对路径文本输入）；成功 `open_universe` 时 Host 已 `write_last_vault`

---

## 摘要

左栏已收敛为 Option Wheel，但**没有设置页**：绑库几乎无 UI、技能面板无入口、BYOK 塞在 Composer 弹层。本 Spec 落地 **设置壳 + 四段 IA（空间 / 模型 / 技能 / 关于）**，**壳层常驻齿轮 + Ctrl+,** 为 P0 入口，空态与 Composer chip 接同一能力；卡片页保持探究主循环。

---

## 0. 前置依赖

| 已有 | 说明 |
|------|------|
| `openUniverse` / `closeUniverse` / `getLastVault` / `setLastVault` | Host + `host.ts`；open 成功 Host 写 lastVault；close **不**清 lastVault |
| `getChatConfig` / `setChatConfig` | BYOK app config |
| `listSkills` / `setSkillEnabled` | vault-scoped |
| `LeftRail` orbit-only | `FocusOrbit` + collapse |
| `SkillsPanel` | 全屏模态 + 自管 Esc；仅听 `soit:open-skills`，**零** dispatch |
| `Composer` BYOK 表单 | 完整字段；仅 mount 时 load config |
| `App` bootEpoch + lastVault 自动恢复 | SpaceSection 必须镜像 epoch 模式 |
| **无** folder dialog 插件 | 路径文本输入 |

---

## 1. 现状

### 1.1 左栏（已达标）

- `LeftRail.tsx`：仅 toggle + `FocusOrbit` /「尚无探究树」  
- 注意：冷启动/解绑常为 `source===demo` + demo 卡 → **EmptyWorkspace 不出现**；绑库入口不能只靠空态

### 1.2 设置相关缺口

| 缺口 | 证据 |
|------|------|
| 无 Settings 页面组件 | — |
| 绑库无 UI | Empty 文案超前；仅 App auto lastVault |
| 解绑无 FE 调用 | `closeUniverse` 无产品入口 |
| 技能孤儿 | 无 `soit:open-skills` dispatch |
| BYOK 仅 Composer | 内联 dialog |
| demo 矩阵下无 Empty | 必须壳层常驻入口 |

### 1.3 不搬离卡/图

聊、深挖/发散、重生、回源、沉淀、图谱、Ctrl+K、Option Wheel、Reentry、LocusPeek。

---

## 2. 需要做的工作

### 2.1 设置壳（P0）

1. 新建 `src/components/shell/SettingsPanel.tsx` + `src/components/shell/settings/*`  
2. `AppShell` 状态：`settingsOpen` + `settingsSection: "space" | "model" | "skills" | "about"`  
3. 事件：`soit:open-settings`，`detail?: { section?: SettingsSection }`  
4. **P0 入口（必须同时满足）：**  
   - **壳层常驻齿轮**（`AppShell` 右上薄 chrome）：focus 卡 / empty / demo / map **均可见**  
   - 快捷键 **Ctrl+,**（Cmd+,）  
   - `CardHeader` 齿轮仅可选快捷，**禁止**作为唯一入口  
   - **禁止**只靠 Ctrl+, 或只靠 EmptyWorkspace  
5. Esc 层叠：**settings → palette → map**。打开设置时关 palette。S4 起无独立 skills 模态，Esc **不**再分支 `skillsOpen`  
6. UI：左 nav 四段 + 右 panel  

### 2.2 空间段 SpaceSection（P0）

| 控件 | 行为 |
|------|------|
| 当前路径 / source 徽章 | `vaultPath`、`source` |
| 打开 / 更换 | 绝对路径输入 +「打开」→ **busy 锁** → `epoch = beginBootLoad()` → 若已绑定且路径变化则先 `closeUniverse()` → `openUniverse(path)` → 成功：`setVaultPath(res.path)` + `loadSnapshot(res.snapshot, epoch)`（**FE 不必**再 `setLastVault`，Host 已写）→ 失败：展示 `res.error`；浏览器 tauri-missing 映射为「需要桌面版」 |
| 使用记住的库 | 打开面板时 `getLastVault()`（或 bootstrap）刷新展示；一键 open 同上 epoch 流程 |
| 清除记住的库 | `setLastVault(null)` + 刷新展示（**不解绑**当前会话） |
| 解绑 | `epoch = beginBootLoad()` → `closeUniverse` → `setVaultPath(null)` → `loadSnapshot(demoSnapshot(), epoch)`（通常回 **demo 卡** 非 Empty；**不清** lastVault） |

空态：`EmptyWorkspace` 在无 `vaultPath` 时按钮「打开设置 · 空间」；**补充**路径，主路径靠壳层齿轮。

### 2.3 模型段 ModelSection（P0）

1. **仅** `src/components/shell/settings/ModelSettingsForm.tsx`  
2. 字段同现 Composer：baseUrl、model、apiKey、保存、清密钥、说明  
3. 保存/清密钥成功后 **必须** `dispatchEvent("soit:chat-config-changed")`  
4. Composer：**删除**内联完整表单；chip 点击 → `soit:open-settings` `{section:"model"}`；监听 `soit:chat-config-changed` 刷新 chip  

### 2.4 技能段 SkillsSection（P0）

**冻结合同：**

1. 抽取 `SkillsList`（或 `SkillsPanel` 的 `embedded` 模式）：**仅**列表+hint，**无** `skills-panel-root` 遮罩、**无**自管 Esc  
2. `SettingsPanel` 技能段挂载该列表  
3. `AppShell` **删除** `skillsOpen` 与独立 `<SkillsPanel open>`  
4. `soit:open-skills` 兼容 → 打开设置 `section=skills`  
5. 未绑定：文案 + 按钮切到 `space`  
6. S1 **不得**长期双挂全屏 skills + settings  

### 2.5 关于段 AboutSection（P1）

Soit 名、bootstrap version、记忆边界三句话（db / md / 密钥）。

### 2.6 样式与 a11y（P1）

`settings.css`；tokens；打开 focus trap 最小：焦点入面板，关还原；无 CDN 字体。

### 2.7 文档（P1）

更新 `shell/AGENTS.md`（设置 IA + 修正 logo 描述漂移）。

---

## 3. 文件变更清单

| 文件 | 变更 | 节 |
|------|------|-----|
| `src/components/shell/SettingsPanel.tsx` | 新建壳 | 2.1 |
| `src/components/shell/settings/SpaceSection.tsx` | 新建 | 2.2 |
| `src/components/shell/settings/ModelSettingsForm.tsx` | 新建 | 2.3 |
| `src/components/shell/settings/SkillsList.tsx` | 新建（自 SkillsPanel 抽） | 2.4 |
| `src/components/shell/settings/AboutSection.tsx` | 新建 | 2.5 |
| `src/components/shell/settings/settings.css` | 新建 | 2.6 |
| `src/components/shell/AppShell.tsx` | **P0 常驻齿轮 + Ctrl+,** + settings 状态 + Esc | 2.1 |
| `src/components/shell/SkillsPanel.tsx` | 瘦身/删除全屏根 或 re-export SkillsList | 2.4 |
| `src/components/shell/EmptyWorkspace.tsx` | 绑库 CTA | 2.2 |
| `src/components/card/Composer.tsx` | 去表单；chip→设置；听 config 事件 | 2.3 |
| `src/components/card/CardHeader.tsx` | 可选第二齿轮 | 2.1 |
| `src/components/shell/AGENTS.md` | 文档 | 2.7 |

---

## 4. 架构图

```text
[AppShell 齿轮 | Ctrl+, | Empty CTA | Composer chip | soit:open-skills]
        │
        ▼
  soit:open-settings { section? }
        │
        ▼
   SettingsPanel (唯一设置模态)
     ├─ 空间 → close?/openUniverse / setLastVault(clear) / epoch loadSnapshot
     ├─ 模型 → get/setChatConfig → soit:chat-config-changed → Composer chip
     ├─ 技能 → SkillsList (embedded)
     └─ 关于 → version + 边界文案

LeftRail = FocusOrbit only
Card = 探究 + 沉淀（不变）
```

---

## 5. 实施顺序

```text
Wave 1（并行）:
  S1  Settings 壳 + AppShell 常驻齿轮/Ctrl+,/Esc + About 占位
  S2  SpaceSection（只写 settings/SpaceSection.tsx + Empty 小改）
  S3  ModelSettingsForm + Composer 瘦身

Wave 2（S1 合并后）:
  S4  SkillsList 并入 + 删 skillsOpen
  S5  CSS polish + AGENTS + npm test / tsc
```

| Plan | 工作量 | 依赖 |
|------|--------|------|
| S1 | 0.5d | — |
| S2 | 0.75–1d | 约定 section 文件路径 |
| S3 | 0.5d | 同上 |
| S4 | 0.5d | S1 |
| S5 | 0.25d | S1–S4 |
| **合计** | **~2.5–3d** | |

S2/S3 **只创建/改 section 与 Composer/Empty**；S1 负责 `SettingsPanel` import 挂载（若并行时 S1 先留 TODO import，S5 前必须接上）。

---

## 6. 验收标准

- [ ] **focus 卡、empty vault、demo 未绑定、map** 均能打开设置（壳层齿轮 + Ctrl+,）  
- [ ] 四段：空间、模型、技能、关于  
- [ ] 绝对路径 open 成功更新 vaultPath + snapshot；失败可见错误；浏览器「需要桌面版」  
- [ ] 已绑定换路径：先 close 再 open；busy 防双点  
- [ ] 解绑 → demo 矩阵；lastVault 仍在直至「清除」  
- [ ] 清除 lastVault 不解绑当前会话  
- [ ] 模型仅设置内完整表单；Composer 无第二套；chip 随保存更新  
- [ ] 技能在设置内可开关；未绑定引导空间；无独立 skills 全屏模态  
- [ ] Empty 未绑定 CTA 可达空间段（若 Empty 可见）  
- [ ] 左栏仍 Option Wheel only  
- [ ] 卡上沉淀/深挖/图谱仍在  
- [ ] `npm test` && `npx tsc --noEmit`  
- [ ] 打开设置 **不** open DB；无 CDN 字体  

---

## 7. 不在范围

- Native folder dialog 插件  
- 技能 GUI 编辑器 / 市场  
- 活线列表进设置  
- 主题/账号/云/课程  
- 沉淀策略中心  
- Host 命令契约改写  
- 图谱 LOD 产品面  

---

## 8. 版本变更

| 版本 | 说明 |
|------|------|
| v1.0 | 首稿 |
| v1.1 | Oracle REVISE：壳层常驻入口 P0；Space epoch/close-then-open；Skills 单模态合同；chat-config-changed 必发；路径统一 shell/settings；工作量上调 |
