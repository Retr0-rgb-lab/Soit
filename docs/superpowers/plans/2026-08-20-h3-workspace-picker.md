# Plan H3: WorkspacePicker + App cold start

> **For agentic workers:** Wave 3 after H2  
> **Spec:** v1.1 §2.3 §2.4  
> **Owns:** `WorkspacePicker.tsx`, picker CSS, `App.tsx` phase mount + boot  
> **Do not touch:** LeftRail exit (H4), SpaceSection rewrite beyond using store if needed

**Depends on H2:** enter/leave/shellPhase

---

### Task H3.1: WorkspacePicker UI

**Files:**
- Create: `src/components/shell/WorkspacePicker.tsx`
- Modify: `src/styles/app.css` or shell css

- [ ] **Step 1:** List recents, last badge, select, Enter button
- [ ] **Step 2:** Empty state + open path form (paste)
- [ ] **Step 3:** forget via ⋯；error banner + retry
- [ ] **Step 4:** Browser: desktop-only messaging；no demo universe
- [ ] **Step 5: Commit**
```bash
git add src/components/shell/WorkspacePicker.tsx src/styles/app.css
git commit -m "feat(shell): WorkspacePicker hall for choosing vault"
```

---

### Task H3.2: App boot + phase gate

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1:** Boot: close if boot.vault；getSessionConfig；no open lastVault；unbound empty
- [ ] **Step 2:** Render WorkspacePicker vs AppShell by shellPhase
- [ ] **Step 3:** Wire picker to store enter/forget
- [ ] **Step 4:** `npm test`；`npm run build` if possible
- [ ] **Step 5: Commit**
```bash
git add src/App.tsx
git commit -m "feat(app): cold start hall without silent open_universe"
```

---

## Acceptance

- [ ] First paint hall when unbound
- [ ] No silent open on boot
- [ ] Enter opens workspace phase
- [ ] 2 commits
