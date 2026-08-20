# Plan M3: workspaceStore materials rail + host bridge

> **After M1+M2**  
> **Spec:** v1.1 §2.2–2.3 §2.5 mock  
> **工作目录:** `E:\学习软件\Soit-wt-model-providers`

---

### Task 3.1 host.ts

- [ ] `listVaultMaterials`, `importVaultMaterial`
- [ ] Mock: list includes `demo/welcome.md`; import appends in-memory entries; size >2MB fail

### Task 3.2 store

- [ ] `materialsRail` state + toggle/open/close/refresh/selectMaterial/importMaterials
- [ ] selectMaterial: map→focus then openDoc
- [ ] force_close rail on loadSnapshot + enter map
- [ ] Tests
- [ ] Commit: `feat(state): materials rail store and host bridge (M3)`

## Acceptance
- [ ] No MaterialsRail UI yet
- [ ] 1 commit
