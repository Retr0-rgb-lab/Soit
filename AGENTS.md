# AGENTS.md

Soit is a **local Agent Host** (Tauri 2 + React): session/inquiry cards in-app, durable memory in an Obsidian vault. Not a course platform, not an Obsidian plugin, not a cloud product.

## Always

- Package manager is **npm** only; commit `package-lock.json`.
- Never commit secrets, `.env*`, or live `**/.soit/universe.db*`.
- Cold start must stay fast: no blocking vault walk, no multi-DB open, **no model/auth network**, **no first-paint CDN fonts** (`fonts.googleapis.com` / remote CSS).
- Product decisions live in `知识库/docs/` — change consensus docs before code when behavior/identity shifts.
- v1 forks are only **深挖 (deepen)** and **发散 (diverge)**; **重生/regenerate stays on the same card** (no third node kind, no merge of inquiries).
- App code lives under `src/` and `src-tauri/` — never under `知识库/`.

## Commands

| Action | Command |
|--------|---------|
| Install | `npm install` |
| Frontend only (mock host) | `npm run dev` |
| Desktop + HMR | `npm run tauri dev` |
| Typecheck + web build | `npm run build` |
| Unit tests | `npm test` |
| Desktop package | `npm run tauri build` |
| Rust check / tests | `cd src-tauri && cargo check` / `cargo test` |

Env: Node LTS, Rust stable, Windows WebView2. Non-ASCII paths usually work; if toolchain fails, use an ASCII clone path (see root `README.md`).

## Nested AGENTS.md

| Read | When |
|------|------|
| `src/AGENTS.md` | Any frontend work under `src/` |
| `src/state/AGENTS.md` | Workspace store, focus/map mode, spawn/regenerate mutations |
| `src/lib/AGENTS.md` | Host bridge, pure graph/map helpers, seeds, co-located unit tests |
| `src/components/shell/AGENTS.md` | Three-pane shell, left rail, map/graph stage |
| `src/components/card/AGENTS.md` | Inquiry card, turns, composer, edge actions |
| `src/components/overlays/AGENTS.md` | Term float, direction chooser, selection bar, tooltips |
| `src-tauri/AGENTS.md` | Rust/Tauri commands, capabilities, permissions, startup path |
| `知识库/AGENTS.md` | Product docs, specs, plans, HTML prototypes |

## Product truth (load when relevant)

| Path | When |
|------|------|
| `知识库/docs/共识.md` | Identity, memory layers, fork rules, v1 scope |
| `知识库/docs/对象模型.md` | Card/edge/vault/universe invariants |
| `知识库/docs/非目标.md` | Explicit non-goals and failed paths |
| `知识库/specs/` | Stage contracts for the feature you are implementing |
| `知识库/plans/` | Wave ownership and parallel file boundaries |
| `README.md` | Runbook, startup verification notes |
