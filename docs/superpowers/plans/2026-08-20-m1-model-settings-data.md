# Plan M1: ModelSettings 数据层 + 迁移

> **For agentic workers:** Wave 1；无 UI；保持 get_chat_config 投影兼容  
> **Spec:** `docs/superpowers/specs/2026-08-20-model-providers-spec.md` §2.1 §2.3  
> **工作目录:** `E:\学习软件\Soit`  
> **Owns:** `src/lib/chat/modelSettings.ts`, `modelSettings.test.ts`, `config.ts` 扩展导出, `src/lib/host.ts` model settings APIs, `src-tauri/src/chat_config.rs`, `lib.rs` register if needed  
> **Do not touch:** ProvidersPanel UI, ModelsPanel, Composer layout beyond types if required

---

### Task M1.1: FE ModelSettings types + migrate + resolve

**Files:**
- Create: `src/lib/chat/modelSettings.ts`
- Create: `src/lib/chat/modelSettings.test.ts`
- Modify: `src/lib/chat/config.ts` / `index.ts` exports
- Modify: `src/types.ts` if ChatConfig mirrored there

- [ ] **Step 1:** Define `Provider`, `ModelEntry`, `ModelSettings` (version:1) per spec
- [ ] **Step 2:** `emptyModelSettings()`, `migrateChatConfigToSettings(cfg)`, `normalizeModelSettings(raw)`
- [ ] **Step 3:** `resolveChatConfig(settings): ChatConfig` — active model → provider; else empty key mock
- [ ] **Step 4:** `readModelSettingsFromLocalStorage` / `writeModelSettingsToLocalStorage`  
  - Prefer key `soit-model-settings`  
  - On read: if missing, try migrate from `soit-chat-config`
  - On write: also write projected ChatConfig to `soit-chat-config` for legacy readers
- [ ] **Step 5:** Unit tests: empty migrate, key migrate, resolve active, delete-active→mock, normalize
- [ ] **Step 6:** `npm test -- src/lib/chat`
- [ ] **Step 7: Commit**
```bash
git add src/lib/chat/modelSettings.ts src/lib/chat/modelSettings.test.ts src/lib/chat/config.ts src/lib/chat/index.ts src/types.ts
git commit -m "feat(chat): ModelSettings types migration and resolve"
```

---

### Task M1.2: Host + Rust persistence

**Files:**
- Modify: `src/lib/host.ts`
- Modify: `src-tauri/src/chat_config.rs`
- Modify: `src-tauri/src/lib.rs` if new commands

- [ ] **Step 1:** Rust: store full JSON as `ModelSettings` in `soit-chat.json` OR dual-file; simplest: **same file** with versioned shape  
  - Read: if old flat ChatConfigDto → migrate in Rust or return and let FE migrate  
  - Prefer FE migrate on get: Rust can store `serde_json::Value` or extended DTO  
  - Practical approach:  
    - `get_model_settings` / `set_model_settings` commands with ModelSettingsDto  
    - `get_chat_config` reads settings and **projects** ChatConfigDto  
    - `set_chat_config` upserts single provider+model (legacy path)
- [ ] **Step 2:** FE `getModelSettings` / `setModelSettings` with browser LS fallback using modelSettings.ts
- [ ] **Step 3:** Keep `getChatConfig`/`setChatConfig` working via projection
- [ ] **Step 4:** `cargo test` in chat_config if possible; `npm test`
- [ ] **Step 5: Commit**
```bash
git add src/lib/host.ts src-tauri/src/chat_config.rs src-tauri/src/lib.rs
git commit -m "feat(host): persist ModelSettings with ChatConfig projection"
```

---

## Acceptance

- [ ] Old ChatConfig with key migrates to 1 provider + 1 model + active
- [ ] resolve → Mock when no active/key
- [ ] get_chat_config still returns camelCase baseUrl/model/apiKey
- [ ] Tests green
- [ ] 2 commits
