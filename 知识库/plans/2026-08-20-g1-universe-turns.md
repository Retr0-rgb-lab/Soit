# Plan G1: Universe turns + schema + module split

> **Spec:** `知识库/specs/2026-08-20-host-hardening-and-durability.md` v1.0 §5、§3.1–3.2、§9  
> **Depends:** none · **Parallel OK with:** G2, G3 · **Unblocks:** G4

**Goal:** Turn/card 写穿 API；snapshot 含 stuck/next；schema gate；`universe` 拆分 ≤800 LOC/文件；path canonicalize 在 `Universe::open`。

## Global Constraints

- Bootstrap 不开 DB  
- Host 生成 turn/card id  
- 文件 ≤800 LOC  
- 新命令：handler + `permissions/bootstrap.toml` + `capabilities/default.json`  
- `cargo test` 全绿  
- 不改 FE（G4 负责）；不改 obsidian.rs  

## 可写

- `src-tauri/src/universe.rs` → 拆为 `src-tauri/src/universe/**`  
- `src-tauri/src/lib.rs`（注册命令、open 调用保持）  
- `src-tauri/permissions/bootstrap.toml`  
- `src-tauri/capabilities/default.json`  
- `src-tauri/AGENTS.md`（命令表）  
- `src-tauri/Cargo.toml` 仅当需要 `dunce`/`chrono` 等小依赖  

## 不可写

- `src/**`（除不得已的类型注释——避免）  
- `src-tauri/src/obsidian.rs`  
- `tauri.conf.json` CSP（G3）  
- Map / 知识库 docs 共识  

---

### Tasks

- [ ] **G1.1** 拆分 `universe` 模块（dto / ids / schema / snapshot / mutations / mod），`lib.rs` 仍 `mod universe`  
- [ ] **G1.2** `Universe::open`：拒绝相对路径；`canonicalize`；存 canonical path  
- [ ] **G1.3** schema：version 校验；snapshot SELECT stuck, next_step→`next`；meta `last_focus_id`  
- [ ] **G1.4** `append_turn` / `update_turn` / `delete_turn`（事务）+ lib commands + perms  
- [ ] **G1.5** `update_card`（含 unread）+ 可选 focus meta 更新  
- [ ] **G1.6** 更新 create_root seed 文案（去掉「发送走内存」）  
- [ ] **G1.7** 测试：append→reopen；parent turns 在 spawn 后仍在；unread；rel path err；version too new  
- [ ] **G1.8** `cargo test`；确认每个新文件 ≤800 行  

### 命令名（冻结）

`append_turn`, `update_turn`, `delete_turn`, `update_card` — 参数见 Spec §5。
