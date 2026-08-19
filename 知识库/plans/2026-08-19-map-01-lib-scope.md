# Plan 01: mapScope + layout depth + paletteRank + stress

> **For agentic workers:** lib only; no React components except types imports  
> **Spec:** `知识库/specs/2026-08-19-map-scale-lod-spec.md` v1.1 §2.1–2.2, 2.6–2.8  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** 1-A

---

### Task 1.1: Constants + mapScope
**Files:** Create `src/lib/mapScope.ts`, `src/lib/mapScope.test.ts`

- [ ] Implement `MapCaps`, defaults matching spec constants
- [ ] `mapConeNodes` — full ancestors, sibling/child caps, aggregate stubs with hard parent rules
- [ ] `mapWorkingNodes` — cone + recent + unread + role + hard clamp
- [ ] `mapAtlasNodes` — roots + branch proxies + path promote
- [ ] Tests: fan80 aggregate, parentId∈views, clamp keeps path, working contains focus

### Task 1.2: graphLayout depth
**Files:** Modify `src/lib/graphLayout.ts`, update tests in `workspaceStore.test.ts` or mapScope tests

- [ ] Replace depthOf guard>20 with iterative depth, max 256
- [ ] Preserve extra fields on laid nodes if present
- [ ] Test stressDeep(40) y strictly increases with depth

### Task 1.3: collapseCrumbs + stressSeed + paletteRank
**Files:** Modify `src/lib/treeNav.ts` + test; Create `stressSeed.ts`, `paletteRank.ts` + tests

- [ ] `collapseCrumbs` per spec
- [ ] stressFan/Deep/Bushy/Mixed returning WorkspaceSnapshot-compatible shapes
- [ ] `rankPaletteNodes({ nodes, query, focusId, recentIds, cap })`

### Task 1.4: Commit
```bash
git add src/lib/mapScope.ts src/lib/mapScope.test.ts src/lib/graphLayout.ts src/lib/treeNav.ts src/lib/treeNav.test.ts src/lib/stressSeed.ts src/lib/paletteRank.ts src/lib/paletteRank.test.ts src/state/workspaceStore.test.ts
git commit -m "feat(map): scope selection, depth layout, palette rank, stress seeds"
```

## Acceptance
- [ ] vitest green for new tests
- [ ] tsc clean for lib files
