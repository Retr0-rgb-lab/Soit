# Plan T1: Process model (DB + DTO + FE types)

> **For agentic workers:** bounded; no tools HTTP  
> **Spec:** `2026-08-21-inquiry-tools-search-spec.md` §2.1  
> **工作目录:** repo root

### Task 1.1: FE types
- Modify: `src/types.ts` — ProcessStep*, Turn.process
- Modify: host UpdateTurnArgs + TurnDto mirrors if in host.ts

### Task 1.2: Rust schema + dto + mutations + snapshot + update_turn
- ALTER process_json if missing; SCHEMA_VERSION stays 1
- update_turn accepts optional process
- snapshot maps process array

### Task 1.3: host.ts updateTurn + patchTurnAi process
- Modify: `src/lib/host.ts`, `src/state/turnHelpers.ts`

## Acceptance
- [ ] cargo test universe update_turn process
- [ ] types compile
