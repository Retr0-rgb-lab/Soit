# Plan M4: 打磨 + 验收

> **For agentic workers:** Wave 3 after M1–M3  
> **Spec:** `docs/superpowers/specs/2026-08-20-model-providers-spec.md` §6 §2.5  
> **工作目录:** `E:\学习软件\Soit`  
> **Owns:** AGENTS docs, edge-case fixes in model settings files only

---

### Task M4.1: Docs + edge cases

**Files:**
- `src/components/shell/AGENTS.md`
- `src/lib/AGENTS.md` if needed
- `SettingsPanel.tsx` nav hint → `供应商 · 密钥`
- Fix any bugs found in M2/M3 files

- [ ] **Step 1:** Update AGENTS / nav hint
- [ ] **Step 2:** Ensure delete provider cascades; edit key empty keeps old
- [ ] **Step 3:** URL validation http(s)
- [ ] **Step 4: Commit**
```bash
git add src/components/shell/AGENTS.md src/lib/AGENTS.md src/components/shell/SettingsPanel.tsx src/components/shell/settings/
git commit -m "docs(settings): model providers AGENTS and edge-case polish"
```

---

### Task M4.2: Full verify

- [ ] **Step 1:** `npm test`
- [ ] **Step 2:** `npm run build`
- [ ] **Step 3:** Manual checklist from spec §6 (browser: add provider → model → active → chip)
- [ ] **Step 4:** Fix failures; commit if needed
```bash
git commit -m "fix(settings): model providers acceptance fixes"
```

---

## Acceptance

- [ ] Spec §6 checkboxes satisfied
- [ ] No paywall/ChatGPT login UI
- [ ] test + build green
