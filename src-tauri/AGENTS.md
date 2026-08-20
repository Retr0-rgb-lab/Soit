# src-tauri/ — Tauri 2 shell

Rust host process for the Soit desktop window. Frontend lives in `../src`; this crate owns **universe.db** and vault-side writes (skills, concepts, residue).

Project-wide: root `AGENTS.md`. IPC types mirrored in `../src/types.ts` and `../src/lib/host.ts`.

## Layout

| Path | Role |
|------|------|
| `src/lib.rs` | App state, commands, `run()`, command-level tests |
| `src/universe/` | SQLite open/migrate/snapshot/mutations (`mod`, `dto`, `ids`, `schema`, `snapshot`, `mutations`) |
| `src/obsidian/` | `concepts/` precipitate + `inquiry/` residue (no full transcripts) |
| `src/skills.rs` | SKILL.md index, seed, enable/disable, inject text (soft cap 32768) |
| `src/chat_config.rs` | BYOK JSON under app config dir (not universe.db) |
| `src/session_config.rs` | `soit-session.json` lastVault (app config; not universe.db) |
| `src/main.rs` | Binary entry |
| `tauri.conf.json` | Window title **Soit**, id `lab.soit.app`, devUrl `5173`; non-null CSP |
| `capabilities/default.json` | Allowed permissions for main window |
| `permissions/bootstrap.toml` | Command allow lists |
| `build.rs` | tauri-build |

## Commands

| Command | Contract |
|---------|----------|
| `get_bootstrap_state` | Instant `{ phase: "ready_ui", vault, lastVault, version }` — **no** DB open / network; `lastVault` from app config only |
| `open_universe(path)` | Absolute path only + canonicalize; ensure `vault/.soit/`, open `universe.db`, seed skills; on success write `lastVault`; `{ ok, path, snapshot? }` with `source: empty\|universe` |
| `close_universe` | Drop DB handle; clear vault bind — **does not** clear `lastVault` |
| `get_workspace_snapshot` | Open universe → DB snapshot (stuck/next + last_focus_id); unbound → `source: "demo"` nodes `[]` |
| `create_root_inquiry(title, question?)` | Host ids; insert root card + seed turn; return snapshot |
| `spawn_inquiry(kind, fromCardId, source, why?, actor?)` | `deepen` \| `diverge` child + SourceSpan edge (+ deepen seed turn); host ids; focus → child (`last_focus_id`) |
| `append_turn(cardId, title?, user, quote?)` | Host `t_*` id; sort_order max+1; quote → `> q\n\nuser`; `{ turn, snapshot }` |
| `update_turn(cardId, turnId, aiHtml?, think?, thinkOpen?, collapsed?, title?, user?)` | Patch provided fields only; `{ ok, snapshot }` |
| `delete_turn(cardId, turnId)` | Remove one turn; `{ ok, snapshot }` |
| `update_card(cardId, title?, status?, question?, stuck?, next?, unread?)` | `next` → `next_step`; status ∈ active\|paused\|done\|stuck; `{ ok, snapshot }` |
| `precipitate_concept(cardId, title, …)` | Write/update `concepts/{slug}.md` (preserve user body) |
| `append_residue(cardId, text)` | Append short note under `inquiry/` |
| `list_skills` | SKILL.md list + enabled flags |
| `set_skill_enabled(id, enabled)` | Toggle; id must exist on disk; returns refreshed list |
| `get_enabled_skills_text` | Concat enabled skill bodies for chat inject (soft cap 32768 bytes) |
| `get_chat_config` / `set_chat_config` | BYOK in app config dir — **not** universe.db |
| `get_last_vault` / `set_last_vault` | Remembered vault path in app config (`soit-session.json`) — **not** universe.db; bootstrap never opens DB |
| `select_vault` | Thin wrapper → `open_universe` (compat) |
| `ping` | Health `"pong"` |
| `list_runtimes` | *(planned dual-track)* detect mock + optional CLIs; no process spawn on list |
| `get_runtime_preferences` / `set_runtime_preferences` | *(planned)* `soit-runtime.json` in app config — **not** universe.db |
| `start_runtime_handoff` | *(planned)* stage brief under `vault/.soit/runs/<runId>/`; mock path required for acceptance |
| `get_runtime_run` / `cancel_runtime_run` | *(planned)* poll/cancel handoff; runs sandbox ≠ card source |

Runtime commands are foreshadowed by dual-track spec v1.1 (`docs/superpowers/specs/2026-08-20-agent-dual-track-spec.md`); handlers may not exist yet — add permission + capability when implementing.

## Load matrix

| Condition | `source` |
|-----------|----------|
| No open universe | `demo` (frontend may fill demo seed) |
| Open, 0 cards | `empty` |
| Open, has cards | `universe` |

## Rules

- Keep startup path light: no heavy work in `setup`; bootstrap never opens DB.
- New commands need **all three**: handler, permission toml, capabilities entry, plus frontend `host.ts` (+ types).
- Prefer `camelCase` JSON fields (`#[serde(rename_all = "camelCase")]`).
- Host generates ids for DB writes (`c_*`, `t_*`, `d_*`/`v_*` children, `e_*` edges).
- Skill toggle: reject empty/unsafe id (`^[A-Za-z0-9_-]+$` only); require `skills/<id>/SKILL.md` on disk.
- Multi-row writes (`create_root_inquiry`, `spawn_inquiry`, turn/card mutations): SQLite immediate transaction.
- Deepen seed `ai_html` / user text: HTML-escape selection label before store.
- `open_universe`: reject relative paths; store canonical vault path; schema_version > app → Err.
- Production source files ≤800 LOC (`universe/` split enforces this).
- Run `cargo test` / `cargo check` from this directory.

## Do not

- Open SQLite on cold bootstrap.
- Call external model/auth APIs without a later spec wave.
- Widen capabilities “just in case.”
- Persist per-card markdown transcripts.
- Fall back to FE memory when a universe mutation command fails (frontend contract).
