# PEL-149 Plan 01: orbitLayout pure helper

> **For agentic workers:** Ownership only; commit `(pel-149-01)`; Diff Report JSON at end.  
> **Spec/Scheme:** `知识库/plans/2026-08-20-pel-149-left-rail-scheme.md`  
> **工作目录:** assigned worktree  
> **Wave:** 1 parallel · **Blocks:** 02, 03 consume types

## Mission

Pure functions: inquiry tree → concentric rings for left-rail FocusOrbit. No React.

## File ownership (ONLY)

| Path | Action |
|------|--------|
| `src/lib/orbitLayout.ts` | **create** |
| `src/lib/orbitLayout.test.ts` | **create** |

**Forbidden:** LeftRail, CSS shell, FocusOrbit component, store changes.

## API (freeze)

```ts
import type { InquiryNode } from "../types";

export type OrbitKind = "root" | "deepen" | "diverge";

export interface OrbitItem {
  id: string;
  title: string;
  kind: OrbitKind;
  unread: boolean;
  /** 0 = center, 1 = inner ring, 2 = outer … */
  ring: number;
  parentId: string | null;
}

export interface OrbitModel {
  center: OrbitItem | null;
  /** rings[0] unused or empty; rings[1] = children of center; rings[2] = children of focus if deeper */
  rings: OrbitItem[][];
  focusId: string;
  rootId: string | null;
}

export interface BuildOrbitOptions {
  /** max items per ring (default 7) */
  ringCap?: number;
  /** max ring depth beyond center (default 2 → rings 1..2) */
  maxRing?: number;
}

/** Build orbit centered on live/root of focus; outer ring follows focus when focus ≠ root. */
export function buildOrbitModel(
  nodes: InquiryNode[],
  focusId: string,
  opts?: BuildOrbitOptions,
): OrbitModel;

/** Children of parentId, kind-stable sort: deepen first then diverge then id */
export function childrenOf(nodes: InquiryNode[], parentId: string): InquiryNode[];
```

## Rules

- Center = `rootOf(nodes, focusId)` (import from `threadDebt` or duplicate minimal walk — prefer import `rootOf`).
- Ring 1 = children of center, capped.
- If focus is descendant of center and focus ≠ center: ring 2 = children of focus; else ring 2 = [] or grandchildren sample under center (prefer children of focus only when focus ≠ center).
- No MindScape; pure data.
- Unit tests: empty, single root, deepen+diverge children, focus deep → outer ring, ringCap.

## Verify

```bash
npm test -- src/lib/orbitLayout.test.ts
```

Commit: `feat(orbit): (pel-149-01) buildOrbitModel pure layout`

## Diff Report

```json
{ "plan": "pel-149-01", "commits": [], "files_modified": [], "verification": { "npm_test": "pass|fail" } }
```
