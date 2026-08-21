# Plan X1: ModelSettings.explainModelId 数据层

> **For agentic workers:** Wave 1 并行；无 UI；FE+Rust 同提交，禁止只改一端  
> **Spec:** `docs/superpowers/specs/2026-08-21-model-assignment-spec.md` v1.1 §2.2  
> **工作目录:** `E:\学习软件\Soit`  
> **Owns:** `src/lib/chat/modelSettings.ts`, `modelSettings.test.ts`, `src/types.ts`, `src-tauri/src/chat_config.rs`, `src/lib/chat/index.ts`（**只** re-export，不写 `resolveExplainPort`）  
> **Do not touch:** `explainActions.ts`, settings UI, `Composer.tsx`, `workspaceStore.test.ts`, `resolvePort` 函数体

---

### Task X1.1: FE types + normalize + resolveExplainConfig

**Files:**
- Modify: `src/lib/chat/modelSettings.ts`
- Modify: `src/lib/chat/modelSettings.test.ts`
- Modify: `src/types.ts`
- Modify: `src/lib/chat/index.ts`

- [ ] **Step 1:** 两份 `ModelSettings` 都加 `explainModelId: string | null`（`types.ts` 与 `modelSettings.ts`）。`version` 仍为 `1`。

- [ ] **Step 2:** `emptyModelSettings` / `migrateChatConfigToSettings` 设 `explainModelId: null`。

- [ ] **Step 3:** `normalizeModelSettings` 在已有 `activeModelId` 校验之后：

```ts
let explainModelId: string | null = null;
const explainRaw = raw.explainModelId;
if (typeof explainRaw === "string" && explainRaw.trim()) {
  const eid = explainRaw.trim();
  const entry = models.find((m) => m.id === eid);
  if (entry && entry.enabled) {
    explainModelId = eid;
  }
}
return { version: MODEL_SETTINGS_VERSION, providers, models, activeModelId, explainModelId };
```

允许 `explainModelId === activeModelId`。空 key **不清**槽。

- [ ] **Step 4:** `upsertFromChatConfig` 最终 `normalizeModelSettings({ ..., activeModelId: activeId, explainModelId: s.explainModelId })`。禁止丢掉该键。

- [ ] **Step 5:** 新增（**不要**抄 `resolveChatConfig` 整段）：

```ts
import { hasApiKey } from "./config";

export function resolveExplainConfig(settings: ModelSettings): ChatConfig {
  const s = normalizeModelSettings(settings);
  if (!s.explainModelId) return resolveChatConfig(s);
  const entry = s.models.find((m) => m.id === s.explainModelId);
  if (!entry || !entry.enabled) return resolveChatConfig(s);
  const provider = s.providers.find((p) => p.id === entry.providerId);
  if (!provider) return resolveChatConfig(s);
  const cfg = normalizeChatConfig({
    baseUrl: provider.baseUrl,
    model: entry.modelId,
    apiKey: provider.apiKey,
  });
  if (!hasApiKey(cfg)) return resolveChatConfig(s); // 空 key → 跟随对话
  return cfg;
}

export function explainModelLabel(settings: ModelSettings): string | null {
  const s = normalizeModelSettings(settings);
  if (!s.explainModelId) return null;
  const entry = s.models.find((m) => m.id === s.explainModelId);
  if (!entry) return null;
  return (entry.label && entry.label.trim()) || entry.modelId;
}
```

- [ ] **Step 6:** `index.ts` **只**从 `modelSettings` re-export `resolveExplainConfig` 与 `explainModelLabel`。**不要**新增 `resolveExplainPort`（X2 的活）。

- [ ] **Step 7:** Tests in `modelSettings.test.ts`：
  1. 旧 JSON 无键 → `explainModelId === null`，`resolveChatConfig` 与今日一致
  2. 独立槽 + 非空 key → `resolveExplainConfig.model === entry.modelId`（API id，不是目录 id）
  3. `null` / 停用 / 删除 → `resolveExplainConfig` 深等 `resolveChatConfig`
  4. 短解释空 key、对话有 key → explain **跟随对话**（`model`/`apiKey` 等于对话），槽本身仍保留 id
  5. `upsertFromChatConfig` 改 key 后 `explainModelId` 仍在
  6. `emptyModelSettings().explainModelId === null`

- [ ] **Step 8:** `npx vitest run src/lib/chat/modelSettings.test.ts`

- [ ] **Step 9: Commit**
```bash
git add src/lib/chat/modelSettings.ts src/lib/chat/modelSettings.test.ts src/types.ts src/lib/chat/index.ts
git commit -m "feat(chat): add explainModelId slot and resolveExplainConfig"
```

---

### Task X1.2: Rust DTO 同 PR

**Files:**
- Modify: `src-tauri/src/chat_config.rs`

- [ ] **Step 1:** `ModelSettingsDto` 加 `#[serde(default)] pub explain_model_id: Option<String>`。**不要**再写 `rename`；靠现有 `rename_all = "camelCase"` → JSON `explainModelId`。

- [ ] **Step 2:** `Default` 与 `migrate_chat_config_to_settings` 字面量都写 `explain_model_id: None`。

- [ ] **Step 3:** `normalize_model_settings`：在清完 invalid active 之后，对 `explain_model_id` 同样「必须存在且 enabled，否则 None」。`version` 仍强制 `1`。`resolve_chat_config` **不改**。

- [ ] **Step 4:** Tests：
  - `parse_versioned_settings` 无 `explainModelId` 键 → `explain_model_id.is_none()`
  - 有效 `explainModelId` 保留
  - 指向 disabled / 未知 id → None
  - `settings_serialize_camel_case` 含 `explainModelId`（migrate 后为 null 也要键或 skip——若 skip_serializing_if none，至少 parse 缺省不炸）
  - 空 key upsert 清 active **保留**已有 explain id（先构造带 explain 的 settings 再 upsert）

- [ ] **Step 5:** `cd src-tauri && cargo test chat_config`

- [ ] **Step 6: Commit**
```bash
git add src-tauri/src/chat_config.rs
git commit -m "feat(host): persist explainModelId on ModelSettingsDto"
```

---

## Acceptance

- [ ] FE+Rust 都能读写 `explainModelId`；旧盘缺省 null
- [ ] 空 key 跟随对话，不清槽
- [ ] upsert 不丢字段
- [ ] `get_chat_config` / `resolveChatConfig` 仍只看对话槽
- [ ] `index.ts` 尚无 `resolveExplainPort`
- [ ] 2 个 commit
