# Plan D3: workspaceStore DocSession + host.ts bridge

> **For agentic workers:** after D1+D2; no DocPane UI yet  
> **Spec:** v1.1 §2.2 mock + §2.4  
> **工作目录:** `E:\学习软件\Soit`

---

### Task 3.1: host.ts bridge + browser mock

**Files:**
- Modify: `src/lib/host.ts`
- Modify: `src/types.ts` (DTOs for resolve/read results if not in D2)

- [ ] `resolveVaultDoc(path)`, `readVaultText(pathRel, maxBytes?)`
- [ ] Mock: `demo/welcome.md` and `*.md` under demo map return fixture Chinese text; unbound → universe_closed style error
- [ ] Types exported for results

### Task 3.2: workspaceStore doc session

**Files:**
- Modify: `src/state/workspaceStore.ts`
- Modify: `src/state/workspaceStore.test.ts` (or new `docSession.store` tests)

- [ ] State: `docSession: DocSessionState` from `initialDocSession()`
- [ ] Actions: `openDoc`, `closeDoc`, `setDocLayout`, `rebindDoc`, `retryDoc`
- [ ] `openDoc` async: reduce open → resolve → read if md/text → load_ok/err with epoch
- [ ] pdf/unsupported from resolve → load_ok with textContent null (guide UI later)
- [ ] **`loadSnapshot` always `force_close` doc**
- [ ] **`setWorkspaceMode` / `toggleMapMode` when entering map → force_close**
- [ ] focus change: optional rebind boundCardId per spec
- [ ] Tests for force_close on map + loadSnapshot

### Task 3.3: Commit

```bash
git add src/lib/host.ts src/types.ts src/state/workspaceStore.ts src/state/workspaceStore.test.ts
git commit -m "feat(state): DocSession store and vault doc host bridge (PEL-156 D3)"
```

---

## Acceptance

- [ ] Map mode clears docSession  
- [ ] loadSnapshot clears docSession  
- [ ] Mock openDoc works in unit test without Tauri  
- [ ] No AppShell DocPane yet  
- [ ] 1 commit  
