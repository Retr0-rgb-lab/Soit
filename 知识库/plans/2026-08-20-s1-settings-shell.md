# Plan S1: Settings shell + AppShell entry

> **For agentic workers:** independent of Space/Model form bodies; mount placeholders OK  
> **Spec:** `docs/superpowers/specs/2026-08-20-settings-shell-spec.md` v1.1 §2.1 §2.5  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** 1 · **Parallel OK with:** S2, S3  
> **Owns:** `SettingsPanel.tsx`, `AboutSection.tsx`, `AppShell.tsx` settings state/gear/Esc, `settings.css` skeleton

---

### Task S1.1: SettingsPanel shell

**Files:**
- Create: `src/components/shell/SettingsPanel.tsx`
- Create: `src/components/shell/settings/AboutSection.tsx`
- Create: `src/components/shell/settings/settings.css`

- [ ] SettingsPanel props: `open`, `onClose`, `section`, `onSectionChange`
- [ ] Nav: 空间 | 模型 | 技能 | 关于
- [ ] Render AboutSection for about; for other sections render `<div data-settings-slot={section} />` **or** dynamic import of SpaceSection/ModelSettingsForm/SkillsList if files exist (try/catch soft)
- [ ] Prefer:
```tsx
// optional lazy sections — if module missing show "加载中…"
import type { ComponentType } from "react";
```
- [ ] aria-modal, label 设置

### Task S1.2: AppShell wire

**Files:**
- Modify: `src/components/shell/AppShell.tsx`

- [ ] State: `settingsOpen`, `settingsSection`
- [ ] Listen `soit:open-settings` → set section + open; close palette
- [ ] Listen `soit:open-skills` → open settings section skills (compat)
- [ ] Ctrl+, open/toggle settings
- [ ] Esc: if settingsOpen close settings first (before palette/map)
- [ ] **Permanent gear button** visible in shell chrome (not only on card) — e.g. fixed top-right when not conflicting map bar; also show in map mode
- [ ] Mount `<SettingsPanel ... />`
- [ ] Remove nothing from Skills yet if S4 owns it — **if** skillsOpen still exists, opening settings should set skillsOpen false; S4 deletes skillsOpen

### Task S1.3: AboutSection

- [ ] Title Soit, version via getBootstrapState once, 3-line memory boundary copy

### Task S1.4: Verify

```bash
npx tsc --noEmit
npm test
```

---

## Acceptance

- [ ] Gear + Ctrl+, open settings in shell
- [ ] Four nav sections switchable
- [ ] Esc closes settings first
- [ ] tsc clean
