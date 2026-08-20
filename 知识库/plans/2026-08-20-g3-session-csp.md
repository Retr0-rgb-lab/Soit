# Plan G3: last_vault restore + CSP + skills cap

> **Spec:** `知识库/specs/2026-08-20-host-hardening-and-durability.md` v1.0 §5.3、§8、H4  
> **Depends:** none（path 若 G1 已做 canonicalize 则复用）· **Parallel OK with:** G1, G2  
> **Coord G4:** bootstrap `lastVault` 字段

**Goal:** 冷启动可恢复上次 vault 路径（仍不在 bootstrap open DB）；CSP 非 null；skills 注入字节上限。

## 可写

- `src-tauri/src/chat_config.rs` **或** 新建 `src-tauri/src/session_config.rs`（last_vault）  
- `src-tauri/src/lib.rs`：bootstrap 返回 `lastVault`；open 成功记 last；commands  
- `src-tauri/src/skills.rs`：`get_enabled_skills_text` soft cap  
- `src-tauri/tauri.conf.json`：CSP  
- `src-tauri/permissions/*`、`capabilities/default.json`（若新命令）  
- `src/lib/host.ts`：last vault helpers（若 G4 未抢；**优先 G3 写 host 的 session 部分**）  
- `src/types.ts`：`BootstrapState.lastVault?`  
- `src/App.tsx`：epoch + 可选 auto `openUniverse(lastVault)`  
- `src/components/shell/LeftRail.tsx`：恢复/绑定后路径体验  
- `src-tauri/AGENTS.md` 相关行  

## 不可写

- `universe` mutations/turns（G1）  
- `obsidian*`（G2）  
- `workspaceStore` chat 写穿（G4）  

---

### Tasks

- [ ] **G3.1** `soit-session.json`：`{ lastVault: string | null }`；get/set commands 或并入 bootstrap  
- [ ] **G3.2** `BootstrapState` 增加 `lastVault: Option<String>`（**不** open DB）  
- [ ] **G3.3** 成功 `open_universe` 后写入 lastVault  
- [ ] **G3.4** FE：App bootEpoch；若 lastVault 则 try open（失败→保持 demo/empty 明确）  
- [ ] **G3.5** CSP 最小可用 + BYOK connect  
- [ ] **G3.6** skills text total cap 32768  
- [ ] **G3.7** `cargo test` + 手动类型：`npm test` 若动 FE  

### 注意

- 若 G1 同时改 `open_universe_impl`：只在 G3 加 set_last_vault 调用，path 校验归 G1  
- Bootstrap **禁止** open DB  
