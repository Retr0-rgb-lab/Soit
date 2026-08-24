# Plan B: Edges, SourceSpan, spawnInquiry, return-to-source

> **For agentic workers:** Implement only this plan’s ownership; commit with `(plan-b)`; emit Diff Report at end.  
> **Spec:** `知识库/specs/2026-08-20-philosophy-alignment-spec.md` v1.1 §Wave B  
> **工作目录:** use assigned worktree absolute path  
> **Wave:** 1 · **Depends:** A done · **Blocks:** C

## 0. Mission

Replace parentId-only spawn with first-class `Edge` + `SourceSpan`; unify `spawnInquiry`; diverge has empty messages; deepen has `buildDeepenScope`; return-to-source scrolls/highlights parent mark.

## 1. Constraints

- Keep `parentId` on cards for tree nav (denormalized); also write `edges` row on spawn.
- Demo path (no vault / source===demo): in-memory edges OK.
- Universe path: prefer Host command `spawn_inquiry` if vault open; else memory + optional later dual-write. Minimum: memory edges always; Host persist when `source==="universe"` via new command.
- Turn-first still; no ChatPort (C).
- Host IDs for DB writes.
- Bootstrap never opens DB.
- Tests: vitest for scope/spawn; cargo test if rust touched.
- Do not push remote. Do not expand map/polish product surface.

## 2. File ownership (ONLY these)

| Path | Action |
|------|--------|
| `src/types.ts` | Add `SourceSpan`, `Edge`, extend snapshot optional `edges` |
| `src/state/workspaceStore.ts` | `edges[]`, `spawnInquiry`, deprecate thin deepen/diverge wrappers |
| `src/state/workspaceStore.test.ts` | spawn/edge/diverge-empty tests |
| `src/lib/deepenScope.ts` | **new** pure `buildDeepenScope` |
| `src/lib/deepenScope.test.ts` | **new** |
| `src/lib/demoSeed.ts` | seed edges for demo tree |
| `src/lib/host.ts` | `spawnInquiry` invoke only (no other host features) |
| `src/components/card/InquiryCard.tsx` | wire spawnInquiry + source highlight consume |
| `src/components/card/CardHeader.tsx` | source chip → return-to-source highlight |
| `src/components/card/TurnItem.tsx` | mark data attributes for highlight target |
| `src/components/card/card.css` | `.mark-highlight` flash |
| `src/components/overlays/DirectionChooser.tsx` | pass richer source if needed |
| `src-tauri/src/universe.rs` | insert/list edges; spawn_inquiry helper |
| `src-tauri/src/lib.rs` | `spawn_inquiry` command |
| `src-tauri/permissions/bootstrap.toml` | allow-spawn-inquiry |
| `src-tauri/capabilities/default.json` | permission entry |
| `知识库/plans/2026-08-20-b-edges-spans.md` | checkboxes only |

**Forbidden:** ChatPort, BYOK, Obsidian write, skills, LeftRail vault (A), map polish.

## 3. Tasks

### B.1 Types + pure scope

```ts
export interface SourceSpan {
  turnId: string;
  text: string;
  markId?: string;
  start?: number;
  end?: number;
}
export interface Edge {
  id: string;
  kind: "deepen" | "diverge";
  fromCardId: string;
  toCardId: string;
  source: SourceSpan;
  why?: string;
  actor?: "user" | "agent";
}
```

`buildDeepenScope(cardId, edgeId, state)` → `{ parentStatus?, span, why?, recentTurns }` — no full parent transcript dump.

### B.2 Store spawnInquiry

- `spawnInquiry({ kind, source, why?, actor? })`
- deepen: child + optional seed turn referencing span
- diverge: child with **empty** turns array
- push Edge; set parentId
- Keep `spawnDeepen`/`spawnDiverge` as wrappers calling spawnInquiry for compat

### B.3 Host + Rust (when universe open)

- `spawn_inquiry` inserts card + edge (+ deepen seed turn); returns snapshot or delta
- Frontend: if vaultPath && source==universe → host; else memory

### B.4 Return-to-source UI

- Store `highlightSpan: SourceSpan | null` or event
- Source chip / parent nav: focus parent, set highlight, TurnItem scrolls mark into view, CSS animation ~1.2s

### B.5 Verify

```bash
npm test
npm run build
cd src-tauri && cargo test
```

Commit: `feat(edges): (plan-b) SourceSpan, spawnInquiry, return-to-source`

## 4. Acceptance

- [x] Demo deepen/diverge create Edge with SourceSpan
- [x] Diverge card has zero turns
- [x] buildDeepenScope unit tests pass
- [x] Return-to-source highlights mark (manual or DOM test if feasible)
- [x] cargo test + npm test + build green

## 5. Diff Report (mandatory end)

Return JSON:
```json
{
  "plan": "B",
  "branch": "<branch>",
  "commits": ["..."],
  "files_modified": [{"path":"...", "notes":"..."}],
  "verification": {"cargo_test":"pass|skip", "npm_test":"pass", "npm_build":"pass"},
  "notes": "..."
}
```
