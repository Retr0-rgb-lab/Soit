# Philosophy alignment — conflict matrix + waves

Spec: `2026-08-20-philosophy-alignment-spec.md` v1.1  
Base: `feature/tauri-workspace-scaffold` @ Wave A (`02cc3ac`)

## File ownership matrix

| Plan | Primary files | Shared risk |
|------|---------------|-------------|
| B edges | types, store, deepenScope, card highlight, universe edges, spawn_inquiry | types.ts, host.ts, lib.rs, universe.rs |
| D obsidian | obsidian.rs, precipitate cmds, CardHeader actions | host.ts, lib.rs, caps, types tail |
| F naming | docs, shell copy | LeftRail copy only |
| C chat | chat/*, Composer, store append | store.ts, host.ts, lib.rs |
| E skills | skills.rs, SkillsPanel | host.ts, lib.rs, LeftRail entry |

## Resolved waves

### Wave 1 — PARALLEL (worktrees; no shared primary ownership)

| Plan | Branch | Worktree |
|------|--------|----------|
| B | `plan-b/edges-spans` | `.worktrees/wt-plan-b` |
| D | `plan-d/obsidian-precipitate` | `.worktrees/wt-plan-d` |
| F | `plan-f/naming-docs` | `.worktrees/wt-plan-f` |

Merge order after Wave 1: **F → D → B** (B largest; F least conflict; D before B so B wins types/store if any accidental overlap).

### Wave 2 — after Wave 1 on main branch

| Plan | Notes | Status |
|------|-------|--------|
| C | ChatPort + Mock + BYOK | merged `plan-c/chatport-byok` |
| E | SKILL.md seed + panel | merged `plan-e/skills` |
| glue | store injects `getEnabledSkillsText` into complete | done on feature branch |

Merge order Wave 2: **E → C** then resolve shared host/lib/caps; skills→chat glue in store.

## Shared-file rule

Within a wave, agents must not edit outside ownership tables. `lib.rs` / `host.ts` / `capabilities` edits must be **append-only** for new commands.
