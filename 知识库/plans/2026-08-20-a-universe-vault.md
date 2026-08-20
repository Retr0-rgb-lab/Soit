# Plan A: Universe DB + Vault bind

> **For agentic workers:** REQUIRED: implement task-by-task; checkbox steps; commit at end of logical chunks.  
> **Spec:** `知识库/specs/2026-08-20-philosophy-alignment-spec.md` v1.1 §Wave A  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** A · **Depends:** none · **Blocks:** B–E

**Goal:** 卡片权威落到 `vault/.soit/universe.db`；绑定 vault 后禁止静默 demo；空库可建根探究；重启树仍在。

## Global Constraints

- Bootstrap **永不** open DB
- `source`: `demo | empty | universe` 严格按 Spec 矩阵
- Turn-first schema（非 Message 角色）
- Host 生成写入 id
- 提交信息英文 conventional commits
- 不扩展图谱/动效产品面

---

### Task A.1: Rust universe module + rusqlite

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/universe.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/permissions/bootstrap.toml`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/AGENTS.md`

- [x] Add `rusqlite` with bundled feature
- [x] Schema migrate v1: meta, cards, turns, edges (empty)
- [x] Commands: `open_universe`, `close_universe`, `get_workspace_snapshot` (read DB), `create_root_inquiry`, `select_vault` → open
- [x] Unit tests: open temp dir → create root → snapshot universe → reopen persists
- [x] `cargo test` in `src-tauri`

---

### Task A.2: Frontend types + host + App load matrix

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/host.ts`
- Modify: `src/App.tsx`
- Modify: `src/lib/AGENTS.md`, `src/AGENTS.md`

- [x] `WorkspaceSnapshot.source`: `"demo" | "empty" | "universe"`
- [x] host: `openUniverse`, `closeUniverse`, `createRootInquiry`
- [x] App: only `demoSnapshot()` when `source === "demo"` (or no-tauri); never when empty/universe
- [x] Browser mock: keep demo path

---

### Task A.3: LeftRail vault + empty workspace UX

**Files:**
- Modify: `src/components/shell/LeftRail.tsx`
- Modify: `src/components/shell/AppShell.tsx` (or small EmptyUniverse)
- Modify: `src/styles/app.css` as needed
- Modify: store if vault path needed in UI state

- [x] Bind vault: prompt path → `openUniverse` → `loadSnapshot`
- [x] Unbind: `closeUniverse` → reload demo matrix
- [x] Naming fence: 不用「宇宙」作一级；显示 vault 名/路径
- [x] Empty: CTA 新建根探究 → `createRootInquiry`

---

### Task A.4: Verify

```bash
cd src-tauri && cargo test
npm test
npm run build
```

Acceptance:
- [x] 绑定空目录 → `source=empty`，界面无 demo 树（Rust test + FE load matrix）
- [x] 新建根探究 → DB 有 card；snapshot `universe`（Rust test）
- [x] 再 open 同路径 → 树仍在（Rust test）
- [x] 未绑定 → 仍可 demo
- [x] bootstrap 无 DB 副作用（既有 test）

---

## Acceptance

- [x] Spec A 矩阵可指证
- [x] `cargo test` + `npm test` + `npm run build` 通过
- [x] 至少 1 个 commit 覆盖 Host+FE (`02cc3ac`)
