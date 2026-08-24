# Plan A3: Host runtime detect / prefs / mock handoff

> **For agentic workers:** Rust only under `src-tauri/`; no FE store  
> **Spec:** v1.1 §2.5–2.6 (mock P0)  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** 1

---

### Task 3.1: Module skeleton

**Files:**
- Create: `src-tauri/src/runtime/mod.rs`
- Create: `src-tauri/src/runtime/prefs.rs`
- Create: `src-tauri/src/runtime/detect.rs`
- Create: `src-tauri/src/runtime/handoff.rs`
- Modify: `src-tauri/src/lib.rs` — `mod runtime;` + register commands
- Modify: `src-tauri/permissions/bootstrap.toml`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/AGENTS.md`

**Commands (camelCase JSON):**

| cmd | return |
|-----|--------|
| `list_runtimes` | `RuntimeInfo[]` always includes mock |
| `get_runtime_prefs` / `set_runtime_prefs` | `soit-runtime.json` in app config dir; default `enableSpawn: false`, `defaultRuntimeId: "mock"` |
| `start_runtime_handoff` | `{ runId, status, text?, error? }` — **mock only** in this plan |
| `cancel_runtime_handoff` | `{ ok }` |

**DTO:**

```rust
// serde rename_all = "camelCase"
struct RuntimeInfo { id, name, kind, available, version?, detail?, bin? }
struct RuntimePreferences { default_runtime_id, bin_overrides: HashMap, enable_spawn }
struct StartHandoffArgs { card_id, runtime_id, brief_markdown? } // if brief provided, require non-empty card_id
struct HandoffResult { run_id, status, text?, error? }
```

**Mock handoff:**
- If `runtime_id != "mock"` && !prefs.enable_spawn → Err("spawn disabled")
- If `runtime_id != "mock"` → Err("cli adapter not implemented") for P0 (or only allow mock)
- mock: sleep ~800ms (async/tokio or std::thread in command), return text with `[[概念]]` style marks
- cancel: simple AtomicBool / Mutex Option run state in AppState

**Path helpers (unit-tested):**
- `runs_dir(vault, run_id)` → must canonicalize under `vault/.soit/runs/`
- reject `run_id` containing `..` or path seps

**Detect:**
- mock always
- for known bins use `which` crate **or** manual PATH split + exists — **no** `cmd /C` user string
- if `which` not in deps, implement safe PATH search only

- [ ] `cargo test` in src-tauri
- [ ] `cargo check`
- [ ] Commit: `feat(host): runtime prefs detect and mock handoff`

---

## Acceptance

- [ ] list_runtimes includes mock
- [ ] prefs default enableSpawn false
- [ ] non-mock start fails when enableSpawn false
- [ ] path traversal test
- [ ] no tauri-plugin-shell
- [ ] permissions + capabilities updated
