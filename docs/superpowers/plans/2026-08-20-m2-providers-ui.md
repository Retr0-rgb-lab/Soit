# Plan M2: 供应商 UI

> **For agentic workers:** Wave 2 after M1；只做供应商子段  
> **Spec:** `docs/superpowers/specs/2026-08-20-model-providers-spec.md` §2.2.1  
> **工作目录:** `E:\学习软件\Soit`  
> **Owns:** `ProvidersPanel.tsx`, `ProviderForm.tsx`, `ModelSettingsForm.tsx`（改成段壳+subnav，先挂 providers）, `settings.css` 列表样式  
> **Do not touch:** ModelsPanel (M3), Composer chip (M3), Rust unless bugfix

**Depends on M1:** `getModelSettings` / `setModelSettings` / types from `modelSettings.ts`

---

### Task M2.1: ProviderForm + ProvidersPanel

**Files:**
- Create: `src/components/shell/settings/ProviderForm.tsx`
- Create: `src/components/shell/settings/ProvidersPanel.tsx`
- Modify: `settings.css`

- [ ] **Step 1:** ProviderForm: name*, baseUrl*, apiKey (edit: empty = keep); save/cancel
- [ ] **Step 2:** ProvidersPanel: load settings; empty state + 添加供应商; list rows (name, url trunc, key status); edit/delete with confirm; cascade delete models + clear active if needed via setModelSettings
- [ ] **Step 3:** Validate http(s) URL; trim; dispatch `soit:chat-config-changed` after save that affects active resolve
- [ ] **Step 4: Commit**
```bash
git add src/components/shell/settings/ProviderForm.tsx src/components/shell/settings/ProvidersPanel.tsx src/components/shell/settings/settings.css
git commit -m "feat(settings): providers list and form for BYOK credentials"
```

---

### Task M2.2: Model section shell with sub-tabs

**Files:**
- Modify: `ModelSettingsForm.tsx` → export default ModelSection shell
- Modify: `SettingsPanel.tsx` hint if needed

- [ ] **Step 1:** Replace single form with sub-nav: `供应商` | `可用模型`
- [ ] **Step 2:** Default tab: providers if empty else models (models panel can be placeholder "M3" stub listing "即将推出" ONLY if ModelsPanel not yet present — prefer import ModelsPanel if exists)
- [ ] **Step 3:** Mount ProvidersPanel on providers tab
- [ ] **Step 4:** If ModelsPanel.tsx missing, show short stub pointing to add provider first
- [ ] **Step 5: Commit**
```bash
git add src/components/shell/settings/ModelSettingsForm.tsx src/components/shell/SettingsPanel.tsx
git commit -m "feat(settings): model section sub-tabs for providers and models"
```

---

## Acceptance

- [ ] Can add/edit/delete provider in settings UI (browser mock)
- [ ] Empty state CTA works
- [ ] Secrets not shown in list plaintext
- [ ] 2 commits
