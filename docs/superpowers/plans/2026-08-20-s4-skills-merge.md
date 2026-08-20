# Plan S4: SkillsList into settings (single modal)

> **Spec:** v1.1 §2.4  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** 2 · **Depends:** S1 SettingsPanel exists  
> **Owns:** `settings/SkillsList.tsx`, `SkillsPanel.tsx`, `AppShell.tsx` skillsOpen removal, `SettingsPanel` skills slot

---

### Task S4.1: Extract SkillsList

**Files:**
- Create: `src/components/shell/settings/SkillsList.tsx`
- Modify: `src/components/shell/SkillsPanel.tsx` (thin re-export or delete modal root)

- [ ] Move list/toggle/refresh/error from SkillsPanel into SkillsList
- [ ] Props: none or `{ onNeedVault?: () => void }`
- [ ] If !vaultPath show CTA calling onNeedVault or dispatch open-settings space
- [ ] **No** document-level Esc listener; **no** full-screen root

### Task S4.2: Wire SettingsPanel + AppShell

**Files:**
- Modify: `src/components/shell/SettingsPanel.tsx`
- Modify: `src/components/shell/AppShell.tsx`

- [ ] section===skills → `<SkillsList />`
- [ ] Remove `skillsOpen` state and `<SkillsPanel open={...} />`
- [ ] `soit:open-skills` → settingsOpen + section skills only

### Task S4.3: Verify

```bash
npx tsc --noEmit
npm test
```

---

## Acceptance

- [ ] One settings modal only for skills
- [ ] No capture Esc on orphan skills panel
- [ ] Unbound skills shows bind guidance
