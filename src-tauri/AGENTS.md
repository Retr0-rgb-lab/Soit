# src-tauri/ — Tauri 2 shell

Rust host process for the Soit desktop window. Frontend lives in `../src`; this crate owns **universe.db** and vault-side writes (skills, concepts, residue).

Project-wide: root `AGENTS.md`. IPC types mirrored in `../src/types.ts` and `../src/lib/host.ts`.

## Layout

| Path | Role |
|------|------|
| `src/lib.rs` | App state, commands, `run()`, command-level tests |
| `src/universe/` | SQLite open/migrate/snapshot/mutations (`mod`, `dto`, `ids`, `schema`, `snapshot`, `mutations`) |
| `src/doc/` | Vault doc resolve + UTF-8 text read (PEL-156 path sandbox; no PDF bytes) + `materials/` list/import |
| `src/obsidian/` | `concepts/` precipitate + `inquiry/` residue (no full transcripts) |
| `src/skills.rs` | SKILL.md index, seed, enable/disable, inject text (soft cap 32768) |
| `src/chat_config.rs` | BYOK JSON (`soit-chat.json`) under app config dir (not universe.db); `ModelSettings` includes optional `explainModelId` |
| `src/session_config.rs` | `soit-session.json` SessionConfig v1: lastVault + recentVaults≤8 (app config; not universe.db) |
| `src/runtime/` | External runtime detect / `soit-runtime.json` prefs / mock handoff (P0; no shell plugin) |
| `src/main.rs` | Binary entry |
| `tauri.conf.json` | Window title **Soit**, id `lab.soit.app`, devUrl `5173`; non-null CSP |
| `capabilities/default.json` | Allowed permissions for main window |
| `permissions/bootstrap.toml` | Command allow lists |
| `build.rs` | tauri-build |

## Commands

| Command | Contract |
|---------|----------|
| `get_bootstrap_state` | Instant `{ phase: "ready_ui", vault, lastVault, version }` — **no** DB open / network; `lastVault` from app config only; FE cold start stays on **hall** and must **not** treat this as auto-open |
| `open_universe(path)` | Absolute path only + canonicalize; ensure `vault/.soit/`, open `universe.db`, seed skills; on success write `lastVault` + `push_recent`; `{ ok, path, snapshot? }` with `source: empty\|universe` — **only** after user enter (or explicit space switch), never silent boot restore |
| `close_universe` | Drop DB handle; clear vault bind — **does not** clear `lastVault` / recents; leave workspace / hall boot uses this |
| `get_workspace_snapshot` | Open universe → DB snapshot (stuck/next + last_focus_id); unbound → `source: "demo"` nodes `[]` |
| `create_root_inquiry(title, question?)` | Host ids; insert root card + seed turn; return snapshot |
| `spawn_inquiry(kind, fromCardId, source, why?, actor?)` | `deepen` \| `diverge` child + SourceSpan edge (+ deepen seed turn); host ids; focus → child (`last_focus_id`) |
| `append_turn(cardId, title?, user, quote?)` | Host `t_*` id; sort_order max+1; quote → `> q\n\nuser`; `{ turn, snapshot }` |
| `update_turn(cardId, turnId, aiHtml?, think?, thinkOpen?, collapsed?, title?, user?)` | Patch provided fields only; `{ ok, snapshot }` |
| `delete_turn(cardId, turnId)` | Remove one turn; `{ ok, snapshot }` |
| `delete_inquiry(cardId)` | Hard-delete card + descendant subtree (edges first; turns cascade); set `last_focus_id`; `{ ok, snapshot }`; no Obsidian writes |
| `update_card(cardId, title?, status?, question?, stuck?, next?, unread?)` | `next` → `next_step`; status ∈ active\|paused\|done\|stuck; `{ ok, snapshot }` |
| `precipitate_concept(cardId, title, …)` | Write/update `concepts/{slug}.md` (preserve user body) |
| `append_residue(cardId, text)` | Append short note under `inquiry/` |
| `list_skills` | SKILL.md list + enabled flags |
| `set_skill_enabled(id, enabled)` | Toggle; id must exist on disk; returns refreshed list |
| `get_enabled_skills_text` | Concat enabled skill bodies for chat inject (soft cap 32768 bytes) |
| `get_chat_config` / `set_chat_config` | BYOK in app config dir — **not** universe.db; `get_chat_config` still projects **dialogue slot only** (`activeModelId`) |
| `get_model_settings` / `set_model_settings` | Full `ModelSettings` v1 (`providers` / `models` / `activeModelId` / optional `explainModelId`); app config `soit-chat.json` |
| `get_session_config` / `set_session_config` | Full SessionConfig v1 (`lastVault` + `recentVaults`≤8); migrate legacy `{lastVault}` on read; **not** universe.db |
| `get_last_vault` / `set_last_vault` | Compat: get last only; `set(Some)` → last + push_recent; `set(None)` → clear last only (recents kept); bootstrap never opens DB |
| `list_runtimes` | Detect known bins on PATH/overrides; **always** includes `mock` available; not called from bootstrap |
| `get_runtime_prefs` / `set_runtime_prefs` | `soit-runtime.json` in app config — **not** universe.db; default `enableSpawn: false`, `defaultRuntimeId: "mock"` |
| `start_runtime_handoff` | P0 **mock only** (~800ms); non-mock → Err when `enableSpawn` false or CLI not implemented; optional `brief.md` under `vault/.soit/runs/<runId>/` |
| `cancel_runtime_handoff` | Cancel in-flight mock handoff (`{ ok }`) |
| `resolve_vault_doc` | PEL-156: `{ path }` → `{ ok, pathRel, pathAbs, kind, displayName, size, error? }`; kind `md\|text\|pdf\|unsupported`; requires open universe |
| `read_vault_text` | PEL-156: `{ pathRel, maxBytes? }` → `{ ok, text?, error? }`; default max **1_500_000** bytes; oversize / non-UTF-8 → error (no silent truncate) |
| `list_vault_materials` | Materials-rail: lazy list under `vault/materials/`; caps depth/entries; **not** called from bootstrap / `open_universe` |
| `import_vault_material` | Materials-rail: `{ fileName, bytesBase64 }` → write under `materials/` (≤**2MB** decoded); collision `stem (n).ext`; reject path seps / `..` in name |
| `select_vault` | Thin wrapper → `open_universe` (compat) |
| `ping` | Health `"pong"` |

Doc companion FE contract: `docs/superpowers/specs/2026-08-20-doc-companion-viewer-spec.md` v1.1. Materials rail: `docs/superpowers/specs/2026-08-20-materials-rail-spec.md` v1.1. Permissions: `allow-resolve-vault-doc` / `allow-read-vault-text` / `allow-list-vault-materials` / `allow-import-vault-material` in `permissions/bootstrap.toml` + `capabilities/default.json`.

## Load matrix

| Condition | `source` |
|-----------|----------|
| No open universe | `demo` (frontend may fill demo seed) |
| Open, 0 cards | `empty` |
| Open, has cards | `universe` |

## Rules

- Keep startup path light: no heavy work in `setup`; bootstrap never opens DB / never `list_runtimes` / never auto-`open_universe` from `lastVault`.
- **Workspace hall:** FE owns `shellPhase`; Host is session + DB authority. Cold start may still have a bound vault after HMR — FE must `close_universe` then stay picker. Stale FE nav after successful open must `close_universe` so Host is never open while FE is on hall.
- New commands need **all three**: handler, permission toml, capabilities entry, plus frontend `host.ts` (+ types).
- Prefer `camelCase` JSON fields (`#[serde(rename_all = "camelCase")]`).
- Host generates ids for DB writes (`c_*`, `t_*`, `d_*`/`v_*` children, `e_*` edges).
- Skill toggle: reject empty/unsafe id (`^[A-Za-z0-9_-]+$` only); require `skills/<id>/SKILL.md` on disk.
- Multi-row writes (`create_root_inquiry`, `spawn_inquiry`, turn/card mutations): SQLite immediate transaction.
- Deepen seed `ai_html` / user text: HTML-escape selection label before store.
- `open_universe`: reject relative paths; store canonical vault path; schema_version > app → Err; success updates session last+recents.
- Runtime: `enableSpawn` Host-enforced default false; handoff cwd/files only under `vault/.soit/runs/<runId>/` (canonicalize prefix); reject `run_id` with `..` or path seps; at most one concurrent handoff.
- **Vault docs (PEL-156):** `dunce::canonicalize` + `starts_with(vault_canon)`; reject path escape and reads under `vault/.soit/**`; `pathRel` output uses `/`; pdf resolve returns kind+size only (no bulk bytes / base64 in P0); commands no-op error when universe closed (`universe_closed`).
- **Materials:** only `vault/materials/**`; import decoded size ≤ 2_097_152; never scan whole vault; never open materials DB on cold start.
- Production source files ≤800 LOC (`universe/` split enforces this).
- Run `cargo test` / `cargo check` from this directory.

## Do not

- Open SQLite on cold bootstrap.
- Call external model/auth APIs without a later spec wave.
- Widen capabilities “just in case.”
- Persist per-card markdown transcripts.
- Fall back to FE memory when a universe mutation command fails (frontend contract).
- Add `tauri-plugin-shell` or expose free-form argv/shell to the frontend.
- Treat external agent session dirs as card ids or universe source.
- Spawn real CLI in P0 (mock handoff only; P1 adapter later).
- Serve PDF via `data:` / `blob:` or register free-form fs scope outside the vault sandbox.
