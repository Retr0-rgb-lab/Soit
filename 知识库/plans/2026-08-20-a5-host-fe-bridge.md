# Plan A5: host.ts + FE runtime types/prefs

> **For agentic workers:** host + lib/runtime only; **no** workspaceStore handoff API  
> **Spec:** v1.1 §2.5  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** 2 · depends A3

---

### Task 5.1: FE types + prefs mirror

**Create:**
- `src/lib/runtime/types.ts` — RuntimeInfo, RuntimePreferences, HandoffResult, defaults
- `src/lib/runtime/prefs.ts` — localStorage mirror key `soit-runtime-prefs` (browser)
- `src/lib/runtime/index.ts` — re-exports

Defaults: `defaultRuntimeId: "mock"`, `enableSpawn: false`, `binOverrides: {}`

---

### Task 5.2: host.ts commands

**Modify:** `src/lib/host.ts`

Mirror chat_config pattern:
- `listRuntimes()` → invoke or browser fallback `[{ id:'mock', name:'Mock', kind:'mock', available:true }]`
- `getRuntimePrefs` / `setRuntimePrefs`
- `startRuntimeHandoff(args)` / `cancelRuntimeHandoff()`
- Browser mock handoff: resolve after timeout with fixed text including `[[函子]]`

**Modify:** `src/types.ts` only if needed for shared DTOs

```bash
npx vitest run src/lib/runtime  # if tests added
git commit -m "feat(host): runtime bridge types and invoke wrappers"
```

---

## Acceptance

- [ ] Browser dev: listRuntimes returns mock
- [ ] No workspaceStore changes
- [ ] Types match Rust camelCase fields
