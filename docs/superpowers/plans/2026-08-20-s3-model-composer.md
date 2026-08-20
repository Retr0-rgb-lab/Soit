# Plan S3: ModelSettingsForm + Composer slim

> **Spec:** v1.1 §2.3  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** 1 · **Parallel OK with:** S1, S2  
> **Owns:** `settings/ModelSettingsForm.tsx`, `Composer.tsx` only

---

### Task S3.1: ModelSettingsForm

**Files:**
- Create: `src/components/shell/settings/ModelSettingsForm.tsx`

- [ ] Move fields from Composer BYOK dialog (baseUrl, model, apiKey, save, clear key, notes)
- [ ] On save/clear success:
```ts
window.dispatchEvent(new CustomEvent("soit:chat-config-changed"));
```

### Task S3.2: Composer slim

**Files:**
- Modify: `src/components/card/Composer.tsx`

- [ ] Remove inline settings dialog JSX and draftCfg/saving for full form
- [ ] Keep chip; onClick:
```ts
window.dispatchEvent(new CustomEvent("soit:open-settings", { detail: { section: "model" } }));
```
- [ ] Listen `soit:chat-config-changed` + reload getChatConfig for chip
- [ ] Keep send/quote UX

### Task S3.3: Verify

```bash
npx tsc --noEmit
npm test
```

---

## Acceptance

- [ ] No second full BYOK form in Composer
- [ ] chip opens settings event
- [ ] ModelSettingsForm dispatches chat-config-changed
