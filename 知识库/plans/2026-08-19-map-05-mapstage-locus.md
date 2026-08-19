# Plan 05: MapStage scope + Locus + store mode + DEV stress

> **For agentic workers:** wire mapScope into UI  
> **Spec:** v1.1 §2.3–2.4, 2.8  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** 2-B (after 01 + 04)

---

### Task 5.1: store mapScopeMode
**Files:** Modify `src/state/workspaceStore.ts` (+ light test)

- [ ] `mapScopeMode: "working" | "cone" | "atlas"`
- [ ] `setMapScopeMode`
- [ ] loadSnapshot resets to working

### Task 5.2: MapStage
**Files:** Modify `src/components/shell/MapStage.tsx`

- [ ] Compute views via mapWorking/Cone/Atlas
- [ ] expandedCaps local state
- [ ] Segmented control; header `工作集 a · 库 b`
- [ ] Aggregate click expands; real node opens card
- [ ] DEV-only stress seed buttons (`import.meta.env.DEV`)
- [ ] labelMode="lod"

### Task 5.3: LocusPeek
**Files:** Modify `src/components/shell/LocusPeek.tsx`

- [ ] Cap neighborhood; +N if needed
- [ ] labelMode none; copy without 完整

### Task 5.4: Commit
```bash
git add src/state/workspaceStore.ts src/state/workspaceStore.test.ts src/components/shell/MapStage.tsx src/components/shell/LocusPeek.tsx
git commit -m "feat(map): working-set scope UI, locus caps, dev stress seeds"
```

## Acceptance
- [ ] Default map not full library labels
- [ ] DEV can load stressFan
