# src-tauri/ — Tauri 2 shell

Rust host process for the Soit desktop window. Frontend lives in `../src`; this crate owns **universe.db** authority (Wave A+).

Project-wide: root `AGENTS.md`. IPC types mirrored in `../src/types.ts` and `../src/lib/host.ts`.

## Layout

| Path | Role |
|------|------|
| `src/lib.rs` | App state, commands, `run()`, command-level tests |
| `src/universe.rs` | SQLite open/migrate/snapshot/create_root |
| `src/main.rs` | Binary entry |
| `tauri.conf.json` | Window title **Soit**, id `lab.soit.app`, devUrl `5173` |
| `capabilities/default.json` | Allowed permissions for main window |
| `permissions/bootstrap.toml` | Command allow lists |
| `build.rs` | tauri-build |

## Commands (Wave A)

| Command | Contract |
|---------|----------|
| `get_bootstrap_state` | Instant `{ phase: "ready_ui", vault, version }` — **no** DB open / network |
| `open_universe(path)` | Ensure `vault/.soit/`, open `universe.db`, return `{ ok, path, snapshot? }` with `source: empty\|universe` |
| `close_universe` | Drop DB handle; clear vault bind |
| `get_workspace_snapshot` | Open universe → DB snapshot; unbound → `source: "demo"` nodes `[]` |
| `create_root_inquiry(title, question?)` | Host ids; insert root card + seed turn; return snapshot |
| `select_vault` | Thin wrapper → `open_universe` (compat) |
| `ping` | Health `"pong"` |

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
- Host generates ids for DB writes (`c_*`, `t_*`).
- Run `cargo test` / `cargo check` from this directory.

## Do not

- Open SQLite on cold bootstrap.
- Call external model/auth APIs without a later spec wave.
- Widen capabilities “just in case.”
- Persist per-card markdown transcripts.
