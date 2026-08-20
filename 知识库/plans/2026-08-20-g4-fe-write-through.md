# Plan G4: FE write-through + deepen scope + store split

> **Spec:** `知识库/specs/2026-08-20-host-hardening-and-durability.md` v1.0 §6、§3.3、§9  
> **Depends:** G1 命令名（Spec 已冻结；可与 G1 并行按契约实现）  
> **Parallel OK with:** G2；与 G3 协调 `App.tsx`/`host.ts` 边界

**Goal:** Universe 路径 turn/card 经 Host；store 拆分 ≤800；deepen scope v2；spawn/merge 不再丢对话。

## 可写

- `src/state/**`（拆分 + write-through）  
- `src/lib/host.ts`（turn/card invokes；若 G3 已加 session 则合并不覆盖）  
- `src/types.ts`（InquiryNode stuck/next；turn command types）  
- `src/lib/deepenScope.ts` + tests  
- `src/state/workspaceStore.test.ts`  
- `src/lib/AGENTS.md`、`src/state/AGENTS.md`  
- `src/components/card/InquiryCard.tsx` / `CardHeader.tsx` 仅：status/question 只读展示或最小编辑（可选）  

## 不可写

- `src-tauri/src/universe*`、`obsidian*`（除读契约）  
- Map LOD 产品面  
- `tauri.conf.json`  

---

### Tasks

- [ ] **G4.1** `host.ts`：`appendTurn` / `updateTurn` / `deleteTurn` / `updateCard` 对齐 Spec §5  
- [ ] **G4.2** 拆 `workspaceStore`：`turnHelpers` / `spawnMerge` / `chatActions` + 薄 store  
- [ ] **G4.3** `source==="universe"`：append/regen/delete/collapse/unread 写穿；禁止 memory spawn  
- [ ] **G4.4** demo 路径保持内存  
- [ ] **G4.5** `bootEpoch` 与 G3 协调（若 G3 已做则复用）  
- [ ] **G4.6** deepenScope v2 + tests  
- [ ] **G4.7** FE tests：mock host universe spawn 失败无节点；scope 无父 turns  
- [ ] **G4.8** `npm test` && `npx tsc --noEmit`；文件 ≤800  

### merge 策略

- write-through 完成后，`mergeHostSnapshot` 全量替换安全  
- 若 Host 暂不可用：universe 路径操作失败返回，**不** memory 成功  
