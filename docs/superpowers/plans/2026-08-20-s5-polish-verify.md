# Plan S5: Polish + AGENTS + full verify

> **Spec:** v1.1 §2.6 §2.7 §6  
> **Wave:** 2 · **Depends:** S1–S4  
> **Owns:** settings.css polish, shell/AGENTS.md, SettingsPanel final imports, integration fix

---

### Task S5.1: Ensure all sections mounted

- [ ] SettingsPanel imports SpaceSection, ModelSettingsForm, SkillsList, AboutSection — no empty slots
- [ ] Gear works on map + focus + empty

### Task S5.2: CSS + AGENTS

- [ ] settings.css: nav, modal, forms using CSS variables from tokens
- [ ] shell/AGENTS.md: document settings IA; fix logo drift (orbit-only)

### Task S5.3: Full verify

```bash
npm test
npx tsc --noEmit
```

- [ ] Fix any integration breaks from parallel waves
- [ ] Manual checklist from Spec §6 mentally verified in code paths

---

## Acceptance

- [ ] Spec §6 checkboxes code-reachable
- [ ] test + tsc green
