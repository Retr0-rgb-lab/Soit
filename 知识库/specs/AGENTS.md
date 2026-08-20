# 知识库/specs/ — stage contracts

Specs define acceptance for a delivery slice (scaffold, map LOD, …).

Parent: `知识库/AGENTS.md`. Execution breakdown: `../plans/`.

## Rules

- Implement against the **spec version** named in the active plan/PR, not against half-remembered chat.
- Specs may freeze APIs (e.g. store methods, host commands, startup budgets). Do not silently rename frozen surfaces without updating the spec.
- Active durability wave: `2026-08-20-host-hardening-and-durability.md` (turn write-through, last_vault, obsidian FM preserve, 800 LOC cap).
- Startup budgets (e.g. interactive shell ≤ 2s on release) are real constraints — do not regress cold path for convenience features. Bootstrap still must not open DB.
- Production source files hard cap **800 LOC**; split on touch when over.
