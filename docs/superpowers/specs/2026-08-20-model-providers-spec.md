# 设置 · 供应商与模型 — Spec v1.0

> 日期: 2026-08-20  
> 依据: Chrome 探查 Explore 设置（可用模型 / 模型分配 / 自带密钥）；`知识库/docs/共识.md`（本机 BYOK、非云）；`知识库/docs/非目标.md`；`2026-08-20-settings-shell-spec.md`；现状 `ModelSettingsForm` + `ChatConfig` + `chat_config.rs`  
> 基线分支: `main`  
> 前置依赖: 设置壳已落地（空间 / 外观 / 模型 / 运行时 / 技能 / 关于）；`getChatConfig` / `setChatConfig`；OpenAI 兼容 `ChatPort`

---

## 摘要

Soit 设置「模型」今日只有 **单端点三字段**（Base URL / Model / API Key），无法表达「多个供应商 + 多模型 + 选用其一」。本 Spec 按 Explore 的 **凭证层 / 模型目录** IA 收成 **本机 BYOK 版**：在设置 · 模型内分 **供应商** 与 **可用模型** 两子段；密钥挂在供应商上；对话选用一个启用模型。 **不抄** 订阅档位、升级墙、ChatGPT 账号登录。

---

## 0. 前置依赖

| 已有 | 说明 |
|------|------|
| `SettingsPanel` section=`model` | 挂载 `ModelSettingsForm` |
| `ChatConfig { baseUrl, model, apiKey }` | app config / localStorage；**不进** universe.db |
| `get_chat_config` / `set_chat_config` | Rust app config JSON |
| `portFromConfig` / Mock 无 key | 空 key → MockChat |
| Composer chip | 打开设置 model；听 `soit:chat-config-changed` |
| 共识 | 本机 Host、BYOK、非云多租户、冷启动无模型网络 |

---

## 1. 现状

### 1.1 Soit

| 能力 | 状态 |
|------|------|
| 单 OpenAI 兼容端点 | ✅ |
| 多供应商列表 | ❌ |
| 多模型目录 | ❌ |
| 添加供应商 / 添加模型 | ❌ |
| 用途三角色（对话/功能/视觉） | ❌（后置） |
| 密钥与宇宙隔离 | ✅（app config） |

### 1.2 Explore（探查摘要，仅借 IA）

| 页 | 做什么 |
|----|--------|
| **可用模型** | 模型目录行（名 + 档位徽章 + 倍率 + 供应商·说明）；**添加 BYOK 模型**；未解锁区 |
| **模型分配** | 对话性 / 功能性 / 视觉 三类用途绑模型 |
| **自带密钥** | **供应商密钥**空态 + **添加供应商**；另有 ChatGPT 账号通道；说明「加模型时不再填密钥」 |
| 壳 | 75% 弹层；左 nav；底 **恢复并关闭 / 保存** |
| 商业 | 免费 1 个 BYOK；点添加可进套餐墙 |

### 1.3 产品锁定（本 Spec）

1. **借：** 供应商（凭证）与模型（目录）拆开；空态 + 添加 CTA；模型行展示「名 · 供应商」。  
2. **不借：** Free/Plus/Pro/Max、倍率计费、升级解锁、套餐弹窗、ChatGPT OAuth/设备码、云同步。  
3. **v1 对话路径仍单活跃模型**（一个 `activeModelId` → 解析成一次 complete 的 baseUrl/model/key）。  
4. **用途分配（对话/功能/视觉）P2 后置**；本波只保证 **对话默认模型**。  
5. 设置一级 nav **不新增**「供应商」顶级项；仍在 **模型** 段内用 **子 Tab**。

---

## 2. 需要做的工作

### 2.1 数据模型（P0）

持久化位置：与今日一致 —— **app config**（Tauri：`soit-chat.json` 或扩展同文件；浏览器：`localStorage`）。**禁止**写入 `universe.db` / vault。

```ts
/** 供应商 = 凭证 + 端点（OpenAI 兼容） */
interface Provider {
  id: string;              // e.g. p_xxx
  name: string;            // 展示名，如「OpenAI」「DeepSeek」
  baseUrl: string;         // https://api.openai.com/v1
  apiKey: string;          // 本机密钥；UI 默认掩码
  createdAt: number;
  updatedAt: number;
}

/** 模型 = 挂在某供应商下的 model id */
interface ModelEntry {
  id: string;              // e.g. m_xxx
  providerId: string;
  modelId: string;         // API 的 model 字符串，如 gpt-4o-mini
  label?: string;          // 可选展示名；空则用 modelId
  enabled: boolean;        // 是否出现在选用列表
  createdAt: number;
  updatedAt: number;
}

/** 取代/扩展原 ChatConfig 的权威配置 */
interface ModelSettings {
  version: 1;
  providers: Provider[];
  models: ModelEntry[];
  /** 对话实际使用的模型；null = Mock */
  activeModelId: string | null;
}
```

**解析为运行时 `ChatConfig`（兼容现 Port）：**

```text
activeModelId → ModelEntry → Provider
→ { baseUrl: provider.baseUrl, model: entry.modelId, apiKey: provider.apiKey }
无 active 或 key 空 → MockChat（与今日 hasApiKey 行为一致）
```

**迁移（打开设置 / get 配置时一次）：**

| 旧状态 | 迁移 |
|--------|------|
| 仅有 `ChatConfig` 且 apiKey 非空 | 建 1 个 Provider（name 默认「默认供应商」或从 baseUrl host 推断）+ 1 个 ModelEntry + `activeModelId` 指向它 |
| 仅有空 key | `providers=[]`, `models=[]`, `activeModelId=null` |
| 已是 `version:1` | 原样 |

写盘时 **同时** 写回扁平 `ChatConfig` 镜像字段（或 get 时动态投影），保证旧 `portFromConfig` / 测试在过渡期不断。

### 2.2 设置 · 模型 UI IA（P0）

**一级：** 设置左 nav 仍为「模型」（hint 改为「供应商 · 密钥」）。

**二级（模型段内 sub-nav 或 segmented control）：**

| 子段 id | 标签 | 职责 |
|---------|------|------|
| `providers` | 供应商 | 凭证列表 + 添加/编辑/删除 |
| `models` | 可用模型 | 模型列表 + 添加 + **选用为对话模型** |

默认打开子段：`providers` 为空时优先 `providers`；否则 `models`。

#### 2.2.1 供应商子段

| 元素 | 行为 |
|------|------|
| 空态 | 文案：「尚未添加供应商。」+ 主按钮 **添加供应商** |
| 列表行 | 名称 · baseUrl 截断 · 密钥状态（已配置 / 未配置）· 编辑 · 删除 |
| 添加 / 编辑 | 表单：名称*、Base URL*、API Key（编辑时可留空表示不改）；保存 / 取消 |
| 删除 | 确认；级联删除其下 `ModelEntry`；若删到 active → `activeModelId=null`（回 Mock） |
| 说明 | 「密钥只存本机。对话模型在「可用模型」中选择。」 |

#### 2.2.2 可用模型子段

| 元素 | 行为 |
|------|------|
| 空态（无供应商） | 「请先添加供应商」+ 按钮切到 `providers` |
| 空态（有供应商无模型） | 「尚未添加模型」+ **添加模型** |
| 列表行 | 展示名/modelId · 供应商名 · 启用开关 · **当前对话** 标记 · 设为对话模型 · 编辑/删除 |
| 添加模型 | 选供应商*、Model ID*、可选显示名；保存 |
| 设为对话模型 | 写 `activeModelId`；立即 `soit:chat-config-changed`；chip 刷新 |
| 启用=false | 不可被选为 active；若当前 active 被关掉 → active 清空 |

**列表视觉（借 Explore 行结构，去商业徽章）：**

```text
[名]  modelId
     供应商名 · 可选备注
     [对话中] 徽章（若 active）
```

不出现：Free/Pro、×倍率、升级解锁。

### 2.3 Host / FE 契约（P0）

**方案 A（推荐，改动面小）：** 扩展现 JSON 文件结构为 `ModelSettings`，命令仍可叫：

| 命令 | 说明 |
|------|------|
| `get_model_settings` | → `ModelSettings`（含迁移） |
| `set_model_settings` | 全量或补丁写入 |
| `get_chat_config` | **保留**：投影 active → 旧 `ChatConfig`，兼容现调用方 |
| `set_chat_config` | **保留过渡**：写入时 upsert 默认供应商+模型（或标 deprecated，仅迁移测） |

FE：

| 模块 | 变更 |
|------|------|
| `src/lib/chat/config.ts` | 类型 + 迁移 + `resolveChatConfig(settings)` |
| `src/lib/host.ts` | invoke 新命令 |
| `settings/ModelSettingsForm.tsx` | 拆/重写为 `ModelSection` + `ProvidersPanel` + `ModelsPanel` + 表单弹层 |
| Composer chip | 文案：`Mock` / `在线 · {label}`（取 active 展示名） |
| 单测 | 迁移、解析、删供应商清 active、无 key→mock |

### 2.4 安全与冷启动（P0）

| 规则 | |
|------|--|
| 密钥 | 仅 app config；不进 git、不进 db、不进日志明文 |
| UI | password 输入；列表只显示「已配置」 |
| 冷启动 | bootstrap **不**读模型配置、**不**发模型网络（保持既有） |
| 校验 | baseUrl 须为 http(s) URL；modelId/name 非空；保存前 trim |

### 2.5 文案与 AGENTS（P1）

- `SettingsPanel` nav hint：`模型` → `供应商 · 密钥`  
- `src/components/shell/AGENTS.md`、`src/lib/AGENTS.md` 更新契约  
- 可选：`知识库/docs` 一句「BYOK = 本机供应商凭证 + 模型目录」（不强制改共识大段）

### 2.6 明确后置（见 §7）

用途三角色、ChatGPT 登录、模型市场、测连通按钮的强制依赖、流式、多模态上传。

---

## 3. 文件变更清单（预期）

| 文件 | 变更 | 节 |
|------|------|-----|
| `docs/superpowers/specs/2026-08-20-model-providers-spec.md` | 本 Spec | — |
| `src/lib/chat/config.ts` 或 `modelSettings.ts` | ModelSettings 类型、迁移、resolve | 2.1 |
| `src/lib/chat/*.test.ts` | 迁移/resolve 单测 | 2.1 |
| `src-tauri/src/chat_config.rs` | 读写扩展结构；投影 get_chat_config | 2.3 |
| `src/lib/host.ts` | 新 invoke | 2.3 |
| `src/components/shell/settings/ModelSettingsForm.tsx` | → 段壳 + 子面板 | 2.2 |
| `src/components/shell/settings/ProvidersPanel.tsx` | **新建** | 2.2.1 |
| `src/components/shell/settings/ModelsPanel.tsx` | **新建** | 2.2.2 |
| `src/components/shell/settings/ProviderForm.tsx` | **新建** 添加/编辑 | 2.2.1 |
| `src/components/shell/settings/ModelForm.tsx` | **新建** | 2.2.2 |
| `src/components/shell/settings/settings.css` | 列表/空态/行 | 2.2 |
| `src/components/shell/SettingsPanel.tsx` | hint 文案 | 2.5 |
| `src/components/card/Composer.tsx` | chip 展示 active 名 | 2.3 |
| `src/components/shell/AGENTS.md` 等 | 文档 | 2.5 |

---

## 4. 架构

```text
┌─────────────────────────────────────────────┐
│ Settings · 模型                               │
│  [供应商] [可用模型]     ← sub-nav             │
│       │         │                             │
│       ▼         ▼                             │
│  providers[]  models[]  activeModelId         │
│       │         │           │                 │
│       └─────────┴───────────┘                 │
│                   │                           │
│                   ▼                           │
│         resolve → ChatConfig                  │
│                   │                           │
│         ChatPort.complete / explain           │
└─────────────────────────────────────────────┘
         持久化：app config only
```

---

## 5. 实施顺序

```text
Wave M1  数据层：ModelSettings + 迁移 + get/set + 投影 ChatConfig + 单测
Wave M2  供应商 UI：列表/空态/添加编辑删除
Wave M3  可用模型 UI：列表/添加/启用/设为对话 + chip
Wave M4  打磨：校验、删除级联、AGENTS、手动剧本
```

| 波 | 依赖 | 工作量 |
|----|------|--------|
| M1 | — | M |
| M2 | M1 | M |
| M3 | M1–M2 | M |
| M4 | M3 | S |

并行：M2/M3 在 M1 合入后可串行（同改 ModelSection 文件时避免双写）。

---

## 6. 验收标准

### 6.1 迁移

- [ ] 旧单 `ChatConfig` 有 key → 打开设置后见 1 供应商 + 1 模型且为对话中  
- [ ] 旧空 key → 供应商空态，对话仍 Mock  
- [ ] 重启 App（或刷新 mock host）配置仍在  

### 6.2 供应商

- [ ] 可添加供应商（名、URL、Key）并出现在列表  
- [ ] 可编辑；Key 留空不覆盖旧值  
- [ ] 删除供应商后其模型消失；若删 active → Mock  
- [ ] 密钥不以明文出现在列表  

### 6.3 模型

- [ ] 有供应商时可添加模型  
- [ ] 无供应商时引导去供应商子段  
- [ ] 「设为对话模型」后 Composer chip 变为在线 · 展示名  
- [ ] 清掉全部 key / 无 active → chip Mock；发消息仍走 Mock  

### 6.4 非目标抽检

- [ ] 无套餐/升级/倍率 UI  
- [ ] 无 ChatGPT 账号登录入口  
- [ ] 设置一级 nav 无新增「云」相关项  
- [ ] `get_bootstrap_state` 路径仍无模型网络  

### 6.5 回归

- [ ] `npm test` / `npm run build` 通过  
- [ ] 手动：添加供应商 → 添加模型 → 设为对话 → 发一条（mock 桌面或 BYOK）  

---

## 7. 不在范围

- 订阅、档位、倍率、升级解锁、支付  
- ChatGPT / Codex 账号 OAuth、设备码  
- 模型市场、远程目录同步  
- 对话/功能/视觉 **多槽分配**（P2；本波仅 `activeModelId` 对话槽）  
- 强制「测试连接」网络探测（可选 P2；不做不得阻塞保存）  
- 流式、工具循环、多模态附件  
- 密钥进 OS keychain（可文档后置；v1 文件配置可接受）  
- 改动卡片探究主循环、图谱、技能语义  

---

## 8. 风险

| 风险 | 缓解 |
|------|------|
| 旧调用方只认 ChatConfig | 保留投影 `get_chat_config`；双写镜像至迁移完成 |
| 设置页变重 | 子 Tab 懒挂载；列表轻量 |
| 用户不知先加供应商 | 模型空态强引导 |
| 与未提交 shell 改动冲突 | 只碰 model 段文件 + config/host |

---

## 9. 版本变更

| 版本 | 说明 |
|------|------|
| v1.0 | 初稿：供应商 + 可用模型；迁移旧 ChatConfig；对齐 Explore IA、去掉商业墙 |
