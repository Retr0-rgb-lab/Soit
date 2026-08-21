# 设置 · 模型分配（对话 / 短解释）— Spec v1.1

> 日期: 2026-08-21  
> 依据: Chrome 探查 Explore `https://ai.explore.poker/chat` 设置（可用模型 / 模型分配 / 自带密钥 / 自动行为）；用户拍板「按这个开 spec」且 **对话 vs 短解释** 独立成槽（不抄功能/视觉三角色）；`知识库/docs/共识.md`；`对象模型.md` 下划线手势；`非目标.md`；`2026-08-20-model-providers-spec.md` v1（P2 多槽后置）；`2026-08-20-card-read-explain-spec.md`（`explainSpan`）  
> 基线分支: `main`  
> 前置依赖: ModelSettings v1（providers + models + `activeModelId`）；`explainSpan` + `ChatPort.explain?`；设置 · 模型 子 Tab 供应商 | 可用模型

---

## 摘要

Soit 今日 **目录与对话槽已落地**（供应商 + 可用模型 + 一个 `activeModelId`），但 **短解释与卡片对话共用同一条 `resolvePort()` → 活跃模型**。高频、短上下文的点词/划词解释会打到对话大模型上。本 Spec 借 Explore **「目录 / 分配」拆页** 的 IA，在本机 BYOK 下落成 **两个用途槽**：对话（`activeModelId`）与短解释（`explainModelId`）。未指定短解释时 **跟随对话**。不抄订阅档位、不抄功能性大杂烩、不做视觉槽。

---

## 0. 前置依赖

| 已有 | 说明 |
|------|------|
| `ModelSettings` v1 | `providers[]` / `models[]` / `activeModelId`；LS `soit-model-settings`；Tauri `soit-chat.json` |
| `resolveChatConfig` / `get_chat_config` | 只投影 **对话** 活跃模型 → 扁平 `ChatConfig` |
| `resolvePort()` | `getChatConfig()` → complete / 今日 explain 共用 |
| `explainSpan` | `state/explainActions.ts`；缓存 `explainCache`；不写 turns/db |
| 设置 · 模型 | 子 Tab：供应商 \| 可用模型；Composer chip 切换 `activeModelId` |
| 共识 | 本机 Host、BYOK、点词先短解释再分叉；冷启动无模型网络 |

---

## 1. 现状

### 1.1 Soit

| 能力 | 状态 | 证据 |
|------|------|------|
| 多供应商 + 模型目录 | ✅ | `src/lib/chat/modelSettings.ts`；`settings/ProvidersPanel` / `ModelsPanel` |
| 对话活跃模型 | ✅ 单槽 | `activeModelId`；Composer `applyActiveModel` |
| 短解释独立模型 | ❌ | `explainSpan` → `resolvePort()`（`explainActions.ts:47`） |
| 模型分配 UI | ❌ | `ModelSettingsForm` 仅 providers \| models |
| 用途三角色（对话/功能/视觉） | ❌ 且 **本波仍不做视觉/标题槽** | model-providers-spec §7 P2 |

`upsertFromChatConfig` 重建对象时 **只带** `providers/models/activeModelId`（`modelSettings.ts:330-335`）。新增字段若不显式保留，会被抹掉。

Rust `ModelSettingsDto` 无 `explain_model_id`；`normalize_model_settings` 强制 `version = 1`。

### 1.2 Explore（2026-08-21 再探，仅借 IA）

设置三页：**可用模型**（目录）/ **模型分配**（用途）/ **自带密钥**（凭证）。

| 槽 | Explore | 数量 | 本机 JSON |
|----|---------|------|-----------|
| 对话性模型 | 直接对话 | **列表** 可拖排序、加减 | `chatModelIds[]` + `activeModelId` |
| 功能性模型 | 标题生成、**智能标注**、项目总结 | **一个** | `functionalModelId` |
| 视觉模型 | 图→文，交给非视觉对话模型 | **一个** | `imageModelId` |

实测：对话用 DeepSeek-V4-Flash（×1.0），功能/视觉用 qwen3.5-flash（×0.2）。智能标注 = 点下划线术语短解释。

**借：** 目录与分配拆开；对话与「短任务」分槽；功能槽用便宜快模型。  
**不借：** `chatModelIds` 白名单拖拽列表；功能性三件事绑一槽；视觉槽；Free/Plus/Pro/Max、倍率、升级墙、ChatGPT OAuth。

### 1.3 产品锁定（本 Spec）

1. **目录照旧。** 供应商 + 可用模型不改语义；Composer 仍可在 **已启用** 模型间切换对话槽。  
2. **分配只做两槽：** 对话 = `activeModelId`；短解释 = `explainModelId`。  
3. **`explainModelId === null` → 跟随对话**（含 Mock）。  
4. **同一目录条目可以同时担任两槽。**  
5. **不做** 视觉、标题自动总结、项目总结、对话白名单列表。  
6. 设置一级 nav 不新增项；模型段 **第三子 Tab「分配」**。  
7. 密钥仍只挂供应商；分配页不填 Key。  
8. 冷启动 / bootstrap **仍禁止** 读模型或打模型网。

---

## 2. 需要做的工作

### 2.1 知识库（P0，先于代码语义）

`知识库/docs/共识.md` 在 §1 或 §2 增一句（勿新开记忆层）：

> BYOK **目录**（供应商+模型）与 **用途槽** 分开。卡片对话走对话槽；点词/划词短解释走短解释槽。未指定短解释时跟随对话模型。

`知识库/docs/对象模型.md`「下划线手势」第 3 条补：短解释不落库；所用模型来自本机 `explainModelId`，缺省跟随对话槽。

`知识库/docs/非目标.md` v1 不做：

- 不抄 Explore 功能性模型（标题/标注/总结绑一槽）与视觉槽  
- 不抄倍率 / 档位 / 升级墙 / 对话模型拖拽白名单（v1）

`知识库/docs/explore-probe.md` §2.6 后加 Soit 映射：对话→`activeModelId`；短解释（智能标注）→`explainModelId`；视觉/功能大杂烩不做。

### 2.2 数据模型（P0）

**不升 `version`。** 仍为 `1`，新增可选字段。旧盘 JSON 无该键 → `null`（跟随）。

```ts
interface ModelSettings {
  version: 1;
  providers: Provider[];
  models: ModelEntry[];
  /** 对话槽；null = Mock */
  activeModelId: string | null;
  /** 短解释槽；null = 跟随 activeModelId */
  explainModelId: string | null;
}
```

**归一化（SSoT，写盘必走）：**

| 条件 | `explainModelId` |
|------|------------------|
| 缺省 / 空串 / 非 string | `null` |
| 指向不存在的 model id | `null` |
| 指向 `enabled === false` | `null` |
| 指向孤儿（provider 已删） | 模型条目本就会被丢掉 → `null` |
| 指向启用模型 | 保留（**允许**与 `activeModelId` 相同） |

`activeModelId` 规则不变。

**`resolveChatConfig(settings)`：** 仍只看 `activeModelId`（对话）。`get_chat_config` 行为不变。

**`resolveExplainConfig(settings): ChatConfig`（新）：**

```text
normalize(settings)
若 explainModelId 命中启用模型且其供应商 apiKey 非空
  → 该条目的 { baseUrl, model, apiKey }
否则
  → resolveChatConfig(settings)   // 跟随对话，含 Mock
```

**空 key 不单独 Mock：** 短解释模型配了但 key 空 → 跟随对话。避免「对话在线、解释却静默 Mock」。

这与 `resolveChatConfig` **不对称**：对话槽空 key 仍投影该条目（`apiKey: ""` → Port 层 Mock）；短解释空 key **不**走独立 Mock，而是 `=== resolveChatConfig(settings)`。空 key 判定与 `hasApiKey` 一致（`apiKey.trim()`）。normalize **不清**空 key 的槽（补密钥后仍指向该模型）。分配页 UI 仍显示该模型、不是「跟随对话」——可选 P1 提示「该供应商未配置密钥，短解释将跟随对话」，不挡保存。禁止把 `resolveChatConfig` 整段抄成 `resolveExplainConfig`。

**`explainModelLabel(settings): string | null`：** 有独立槽则该条目展示名；`null` 槽返回 `null`（UI 显示「跟随对话」）。

**迁移 / 双写：**

| 路径 | 行为 |
|------|------|
| `emptyModelSettings` | `explainModelId: null` |
| `migrateChatConfigToSettings` | `explainModelId: null` |
| `upsertFromChatConfig` | **必须拷贝** `s.explainModelId` 再 normalize（今日会丢字段） |
| `writeModelSettingsToLocalStorage` | 仍只镜像 **对话** `ChatConfig` 到 `soit-chat-config` |
| 旧 v1 JSON 无键 | normalize → `null` |

Rust `ModelSettingsDto` 加 `explain_model_id: Option<String>`（`#[serde(default)]`）；JSON 名靠现有 `rename_all = "camelCase"` → `explainModelId`（Rust 字段保持 snake_case，不要再手写 rename）。`normalize_model_settings` 按上表清无效 id；`Default` **与** `migrate_chat_config_to_settings` 结构体字面量都要写 `explain_model_id: None`。`upsert_from_chat_config` 原地改 `s`：空 key 清 active 时会自然保留 explain 槽；`providers` 空走 migrate 时回到 `None`。`resolve_chat_config` **不**改。不新增 Tauri command。

FE 有 **两份** `ModelSettings`：`src/types.ts`（`host.ts` 使用）与 `src/lib/chat/modelSettings.ts`（normalize / Composer）。必须同 PR 改两端 + Rust DTO，否则 `set_model_settings` 会 serde-ignore 未知字段并写盘丢掉。

### 2.3 运行时：短解释走独立 Port（P0）

`src/lib/chat/index.ts` 新增：

```ts
export async function resolveExplainPort(
  configOverride?: ChatConfig | null,
): Promise<ChatPort>
```

- override 有值 → `portFromConfig(override)`（测试）  
- 否则 `getModelSettings()` → `portFromConfig(resolveExplainConfig(settings))`  
- catch → `portFromConfig(resolveExplainConfig(readModelSettingsFromLocalStorage()))`  
  禁止抄 `resolvePort` 的 `readChatConfigFromLocalStorage()`（那是对话槽投影，没有 explain 槽）

`resolvePort()` **只服务 complete**（`runCompletion` / 发消息）。禁止 explain 再调它。

`explainSpan`：`const port = await resolveExplainPort();` 其余（cache、`port.explain`、complete fallback、stripThink）不变。

`explainActions.test.ts`：把现有 `vi.mock("../lib/chat")` 的 `resolvePort` 改成 mock `resolveExplainPort`（仍 spread `...actual`）；断言 `resolvePort` **未被调用**。`workspaceStore.test.ts` 的 `resolvePort` mock **不要动**（complete 主路径）。独立 explain 槽的 complete fallback：在 `modelSettings` 测 `resolveExplainConfig`，不必在 `explainActions` 里 stub host。

### 2.4 设置 UI：第三子 Tab「分配」（P0）

`ModelSettingsForm` 子 Tab：`供应商 | 可用模型 | 分配`。

- 默认 Tab：**无供应商 → 供应商**；否则 **可用模型**（不默认进分配）。  
- intro 改：先凭证，再目录，再在分配里把模型绑到对话 / 短解释。

新建 `settings/AssignmentPanel.tsx`（只此文件写分配 UI）：

| 行 | 控件 | 写入 |
|----|------|------|
| **对话模型** | `<select>`：已启用模型；可空 = Mock | `activeModelId` |
| 说明 | 「卡片作曲与发消息。也可在作曲条切换。」 | — |
| **短解释模型** | `<select>`：第一项「跟随对话」+ 已启用模型 | `explainModelId`；跟随 = `null` |
| 说明 | 「点词 / 划词浮层。建议用更快更便宜的模型。」 | — |

规则：

- 无启用模型：空态 CTA「前往可用模型」（`onNeedModels`）。  
- 保存：`setModelSettings` + `soit:chat-config-changed`（Composer 刷新对话 chip；解释下次打开浮层生效）。  
- 不在分配页添加供应商/模型/填 Key。  
- 不用拖拽；不用「添加模型」弹出目录墙。  
- 样式走既有 `settings-field` / `settings-model-*`，暖纸 token，不抄 Explore 黄粉。

`ModelsPanel` / `ProvidersPanel`：删除或停用导致 id 非法时，**依赖 normalize 写盘清槽**；不必重复手写 cascade。可选：删除确认文案若该模型是短解释槽，提一句「短解释将改回跟随对话」——非 P0。

Composer：`applyActiveModel` 已 spread `modelSettings`，不会抹 `explainModelId`。本波 **不改** Composer 布局。chip 仍只表示对话槽。

### 2.5 文档指针（P1）

| 文件 | 变更 |
|------|------|
| `docs/superpowers/specs/2026-08-20-model-providers-spec.md` §7 | 「多槽分配 P2」改为指向本 Spec；对话/短解释已开做；视觉仍后置 |
| `docs/superpowers/specs/2026-08-20-card-read-explain-spec.md` | 前言「复用 `resolvePort`」改为 `resolveExplainPort`；§2.2 入口仍是 `explainSpan` |
| `src/lib/AGENTS.md` | ModelSettings 含 `explainModelId`；`resolveExplainPort`；explain 禁止 `resolvePort` |
| `src/components/shell/AGENTS.md` | 模型子 Tab 三页；分配契约 |
| `src/lib/chat/AGENTS.md` | 若存在：resolve 双路径 |
| `src/state/AGENTS.md` | `explainSpan` → `resolveExplainPort` |
| `src-tauri/AGENTS.md` | DTO 字段一句 |

---

## 3. 文件变更清单

| 文件 | 变更 | 节号 |
|------|------|------|
| `知识库/docs/共识.md` | 目录 vs 用途槽 | 2.1 |
| `知识库/docs/对象模型.md` | 短解释模型来源 | 2.1 |
| `知识库/docs/非目标.md` | 不抄功能/视觉/白名单 | 2.1 |
| `知识库/docs/explore-probe.md` | Soit 映射 | 2.1 |
| `src/lib/chat/modelSettings.ts` | 字段 + normalize + resolveExplainConfig + upsert 保留 | 2.2 |
| `src/lib/chat/modelSettings.test.ts` | 跟随 / 独立 / 空 key 跟随 / upsert 保留 / 停用清空 | 2.2 |
| `src/lib/chat/index.ts` | X1 re-export `resolveExplainConfig` / `explainModelLabel`；X2 写 `resolveExplainPort`（禁止并行） | 2.2–2.3 |
| `src/types.ts` | `ModelSettings.explainModelId` | 2.2 |
| `src-tauri/src/chat_config.rs` | DTO + normalize + 单测 | 2.2 |
| `src/state/explainActions.ts` | `resolveExplainPort` | 2.3 |
| `src/state/explainActions.test.ts` | mock 路径 | 2.3 |
| `src/components/shell/settings/ModelSettingsForm.tsx` | 第三 Tab | 2.4 |
| `src/components/shell/settings/AssignmentPanel.tsx` | **新建** | 2.4 |
| `src/components/shell/settings/settings.css` | 分配段少量 | 2.4 |
| `docs/superpowers/specs/2026-08-20-model-providers-spec.md` | §7 指针 | 2.5 |
| `docs/superpowers/specs/2026-08-20-card-read-explain-spec.md` | explain 改走 `resolveExplainPort` | 2.5 |
| nested `AGENTS.md` | 契约 | 2.5 |

**不改：** `runCompletion.ts`、Composer 结构、`openaiCompat`/`mockChat` 的 explain 实现、host 新 command、universe.db。

---

## 4. 架构图

```text
                    ModelSettings (app config / LS)
                    providers[]  models[]
                    activeModelId ──► resolveChatConfig ──► resolvePort ──► complete
                    explainModelId ─► resolveExplainConfig ─┐
                         │ null                              │
                         └──── 跟随 ─────────────────────────┤
                                                             ▼
                                                    resolveExplainPort
                                                             │
                                                             ▼
                                                      explainSpan
                                                   (cache, 不写 db)

设置 · 模型
  供应商     = 凭证
  可用模型   = 目录（启用 + 设为对话，保留）
  分配       = 两槽绑定（本波新增）
```

---

## 5. 实施顺序

| 阶段 | 任务 | 依赖 | 工作量 |
|------|------|------|--------|
| Wave 1 并行 | X0 知识库 | — | 0.5h |
| Wave 1 并行 | X1 数据层 FE+Rust | — | 0.5d |
| Wave 2 并行 | X2 `resolveExplainPort` + `explainSpan` | X1 | 0.3d |
| Wave 2 并行 | X3 分配 UI | X1 | 0.5d |
| Wave 3 | X4 AGENTS + 旧 spec 指针 + `npm test` / `npm run build` | X2 X3 | 0.3d |

X0 与 X1 文件不相交。X2 与 X3 不相交（X2 不改 settings UI；X3 不改 explainActions）。X1 **独占** `modelSettings.ts` / `types.ts` / `chat_config.rs`（含 `resolveExplainConfig` / `explainModelLabel`）。`src/lib/chat/index.ts` 串行：X1 只加上述 re-export；X2 再写 `resolveExplainPort` 函数体。禁止 X1/X2 并行改 `index.ts`。

---

## 6. 验收标准

### 6.1 数据

- [ ] 旧盘无 `explainModelId` → 读出来是 `null`，对话行为与今日一致  
- [ ] `explainModelId` 指向启用模型且 key 非空 → `resolveExplainConfig.model` 为该条目的 API `entry.modelId`（不是目录 id）  
- [ ] `null` / 停用 / 删除 / 空 key → `resolveExplainConfig` **等于** `resolveChatConfig`  
- [ ] `upsertFromChatConfig` 不丢 `explainModelId`  
- [ ] `get_chat_config` 仍只投影对话槽  
- [ ] 密钥不进 `universe.db`；bootstrap 不读本配置  

### 6.2 运行时

- [ ] `explainSpan` 调用 `resolveExplainPort`，单测证明不调用 `resolvePort`  
- [ ] 独立短解释槽时，complete 发消息仍用 `activeModelId`  
- [ ] 无 key 全体 → 短解释仍 Mock，不抛「未配置」新错  
- [ ] PEL-163 缓存语义不变（同卡同 span 不二次打模型）  

### 6.3 UI

- [ ] 模型段三个子 Tab；分配页两行 select  
- [ ] 「跟随对话」可保存且刷新后仍在  
- [ ] 选独立短解释模型后，Composer 对话 chip **不变**  
- [ ] 无套餐/倍率/视觉槽/拖拽对话列表  

### 6.4 回归

- [ ] `npm test`  
- [ ] `npm run build`  
- [ ] `cd src-tauri && cargo test`（至少 `chat_config`）  

---

## 7. 不在范围

- 视觉模型槽、图转文  
- 标题自动生成 / 项目总结 独立槽（不绑进短解释）  
- Explore 式 `chatModelIds[]` 拖拽白名单  
- 订阅档位、倍率、升级墙、ChatGPT 账号登录  
- Composer 上再放「短解释模型」chip  
- 强制测试连接  
- 改 `ChatPort.explain` 协议、改短解释 prompt 文案  
- 换短解释槽 bust PEL-163 缓存（仍按 cardId+span）  
- 流式、多模态附件、keychain  

---

## 8. 风险

| 风险 | 缓解 |
|------|------|
| `upsertFromChatConfig` 丢新字段 | 单测锁拷贝；normalize 入口统一 |
| FE/Rust DTO 不同步 | JSON `explainModelId`；Rust 字段 `explain_model_id` + 现有 `camelCase`；parse 缺省 None；FE+Rust 同 PR |
| PEL-163 缓存不按模型分键 | 本波不改；换短解释槽不 bust 同卡同 span 缓存（6.2 已锁语义） |
| explain 测试仍 mock `resolvePort` | 本波改 mock 目标；X2 验收必查 |
| 用户不知有分配页 | 可用模型 note 可加一句「短解释请到分配」——P1，不挡 |
| 与未提交 shell/CSS 冲突 | X3 只碰 settings 模型段文件 |

---

## 9. 版本变更

| 版本 | 说明 |
|------|------|
| v1.0 | 初稿：两槽、跟随、第三 Tab、不抄功能/视觉 |
| v1.1 | Oracle APPROVE-WITH-MINOR：空 key 不对称、catch 禁止抄对话投影、X1/X2 串行 index.ts、双份 ModelSettings+Rust migrate 字面量、card-read-explain 指针、PEL-163 缓存不按模型分键 |
