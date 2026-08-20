# Plan H1: SessionConfig + recentVaults

> **For agentic workers:** Wave 1；无 UI；Host 权威 session  
> **Spec:** `docs/superpowers/specs/2026-08-20-workspace-hall-spec.md` v1.1 §2.2  
> **工作目录:** `E:\学习软件\Soit`（若 dirty 则 worktree `E:\学习软件\Soit-wt-workspace-hall`）  
> **Owns:** `session_config.rs`, `lib.rs` open push, permissions, `sessionConfig.ts`, host session APIs, types  
> **Do not touch:** App.tsx boot, WorkspacePicker, SpaceSection UI

---

### Task H1.1: FE pure session helpers + tests

**Files:**
- Create: `src/lib/sessionConfig.ts`
- Create: `src/lib/sessionConfig.test.ts`
- Modify: `src/types.ts` — `SessionConfig`
- Modify: `src/lib/AGENTS.md` — one line session

- [ ] **Step 1:** Types + `emptySessionConfig`, `normalizeSessionConfig`, `migrateSessionRaw`, `pushRecentVault`, `removeRecentVault` (max 8, dedupe, last clear on remove if match)
- [ ] **Step 2:** LS key `soit-session` read/write helpers for browser
- [ ] **Step 3:** Unit tests green: `npm test -- src/lib/sessionConfig.test.ts`
- [ ] **Step 4: Commit**
```bash
git add src/lib/sessionConfig.ts src/lib/sessionConfig.test.ts src/types.ts src/lib/AGENTS.md
git commit -m "feat(session): SessionConfig normalize and recentVaults helpers"
```

---

### Task H1.2: Rust session + host bridge

**Files:**
- Modify: `src-tauri/src/session_config.rs`
- Modify: `src-tauri/src/lib.rs` — open_universe success push_recent
- Modify: permissions + capabilities
- Modify: `src/lib/host.ts` — getSessionConfig / setSessionConfig；setLastVault 兼容语义
- Modify: `src-tauri/AGENTS.md` if needed

- [ ] **Step 1:** DTO version + recent_vaults；migrate on read；get/set_session_config commands
- [ ] **Step 2:** set_last_vault(Some) pushes recent；None clears last only
- [ ] **Step 3:** open success path already write_last_vault → also push_recent with canonical path
- [ ] **Step 4:** permissions + capabilities
- [ ] **Step 5:** FE host wrappers；browser LS authority
- [ ] **Step 6:** `cargo test` session_config；`npm test -- src/lib/sessionConfig`
- [ ] **Step 7: Commit**
```bash
git add src-tauri/src/session_config.rs src-tauri/src/lib.rs src-tauri/permissions src-tauri/capabilities src/lib/host.ts src-tauri/AGENTS.md
git commit -m "feat(host): session recents with get/set_session_config"
```

---

## Acceptance

- [ ] Old `{lastVault}` migrates to version 1 + recentVaults
- [ ] push caps at 8, newest first, deduped
- [ ] set last null does not wipe recents
- [ ] Tests green
- [ ] 2 commits
