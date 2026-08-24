# 知识库/ — product and delivery truth

Human-facing product memory for Soit. **Not** application runtime code.

Root engineering entry: `/AGENTS.md`. Implement under `src/` and `src-tauri/` only.

## Tree

| Path | Holds | Write when |
|------|-------|------------|
| `docs/` | **Decided** consensus | Product identity, invariants, non-goals change |
| `specs/` | Stage contracts (what “done” means) | Starting or revising a feature wave |
| `plans/` | Wave breakdown + file ownership | Executing multi-plan work |
| `design/` | Throwaway HTML prototypes | Exploring UX offline from the app |

## Rules

- **Consensus first:** if code would change identity, fork model, memory layers, or v1 scope, edit `docs/共识.md` (and related docs) before implementation.
- `docs/` = already decided. Do not treat drafts, chat, or prototypes as authority over `docs/`.
- `specs/` bind a delivery slice; implement against the active spec, not against outdated plan prose when they disagree — resolve by updating docs/spec.
- `plans/` file-ownership tables prevent parallel clobbering; respect “可写” boundaries when executing a plan.
- `design/prototype-workspace.html` is **interaction reference**, not the app. Prototype may use CDN fonts; **production `src/` must not**.

## Nested

| Read | When |
|------|------|
| `docs/AGENTS.md` | Reading or editing product consensus |
| `specs/AGENTS.md` | Implementing or reviewing against a stage spec |
| `plans/AGENTS.md` | Running wave plans / parallel ownership |
| `design/AGENTS.md` | Prototyping or porting from HTML demo |
