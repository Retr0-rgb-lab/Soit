# Plan H5: Docs + verify

> **For agentic workers:** Wave 5 final  
> **Spec:** v1.1 §2.7 §6  
> **Owns:** AGENTS.md files, 共识一句, fix failures only in hall files

---

### Task H5.1: Docs

**Files:**
- `src/AGENTS.md`, `src/components/shell/AGENTS.md`, `src/lib/AGENTS.md`, `src-tauri/AGENTS.md`
- `知识库/docs/共识.md` — one sentence 门厅选库 / 屋子探究

- [ ] **Step 1:** Remove “boot may open lastVault” language；document shellPhase
- [ ] **Step 2:** Consensus one-liner
- [ ] **Step 3: Commit**
```bash
git add src/AGENTS.md src/components/shell/AGENTS.md src/lib/AGENTS.md src-tauri/AGENTS.md 知识库/docs/共识.md
git commit -m "docs: workspace hall shellPhase and consensus note"
```

---

### Task H5.2: Full verify

- [ ] **Step 1:** `npm test`
- [ ] **Step 2:** `npm run build`
- [ ] **Step 3:** `cd src-tauri && cargo test session_config` (or full if needed)
- [ ] **Step 4:** Fix failures；commit if needed
```bash
git commit -m "fix(shell): workspace hall acceptance fixes"
```

---

## Acceptance

- [ ] Spec §6 checkboxes met or filed
- [ ] test + build green
- [ ] push when orchestrator requests
