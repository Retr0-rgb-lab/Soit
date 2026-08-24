# Plan 04: GraphCanvas LOD + CSS

> **For agentic workers:** GraphCanvas + app.css only; backward compatible  
> **Spec:** v1.1 §2.2  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** 2-A (after Plan 01)

---

### Task 4.1: GraphCanvas
**Files:** Modify `src/components/shell/GraphCanvas.tsx`

- [ ] Accept `InquiryNode | MapNodeView`
- [ ] `labelMode: "all" | "lod" | "none"` default `"none"`
- [ ] Role classes; edge hot/field
- [ ] Aggregate styling; onSelect still passes id (parent handles agg)

### Task 4.2: CSS
**Files:** Modify `src/styles/app.css`

- [ ] `.graph-node.role-*` opacity/radius
- [ ] `.graph-edge.field`
- [ ] No blur on graph nodes/edges

### Task 4.3: Commit
```bash
git add src/components/shell/GraphCanvas.tsx src/styles/app.css
git commit -m "feat(graph): LOD roles and label modes"
```

## Acceptance
- [ ] LocusPeek still typechecks with old-style props
- [ ] field opacity rules present in CSS
