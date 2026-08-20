# Plan H4: Leave entry + CTA cleanup

> **For agentic workers:** Wave 4 after H3  
> **Spec:** v1.1 §2.5 §2.6  
> **Owns:** LeftRail, SpaceSection, EmptyWorkspace, OpenDocPopover, MaterialsRail, SkillsList  
> **Do not touch:** session_config.rs, spaceNav core (unless bugfix)

---

### Task H4.1: Exit workspace entries

**Files:**
- Modify: `src/components/shell/LeftRail.tsx` — leaf name + 退出工作区
- Modify: `src/components/shell/settings/SpaceSection.tsx` — leave/switch only via store；解绑→退出工作区

- [ ] **Step 1:** LeftRail shows vault leaf + leave action → store.leave()
- [ ] **Step 2:** SpaceSection open/switch/leave/clearLast via store/host contract；remove private open pipeline
- [ ] **Step 3: Commit**
```bash
git add src/components/shell/LeftRail.tsx src/components/shell/settings/SpaceSection.tsx
git commit -m "feat(shell): exit workspace from rail and space settings"
```

---

### Task H4.2: Unbound CTAs

**Files:**
- Modify: `EmptyWorkspace.tsx` — remove 打开设置·空间
- Modify: `OpenDocPopover.tsx`, `MaterialsRail.tsx`, `SkillsList.tsx` — hall guidance

- [ ] **Step 1:** Empty only for bound empty
- [ ] **Step 2:** Other CTAs → 门厅 / leave，not settings-as-hall
- [ ] **Step 3: Commit**
```bash
git add src/components/shell/EmptyWorkspace.tsx src/components/doc/OpenDocPopover.tsx src/components/shell/MaterialsRail.tsx src/components/shell/settings/SkillsList.tsx
git commit -m "fix(shell): stop using settings space as workspace hall"
```

---

## Acceptance

- [ ] Leave returns to picker
- [ ] SpaceSection no dual open pipeline
- [ ] No settings·空间 as sole unbound home
- [ ] 2 commits
