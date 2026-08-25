# Plan M2: IPC DTO 时间戳字段(createdAt / updatedAt)

> **For agentic workers:** 三个文件小改 + 编译驱动找全构造点。0.3d。不碰 `src-tauri/src/mcp/`。
> **Spec:** `docs/superpowers/specs/2026-08-25-mcp-read-ergonomics-spec.md` §2.2
> **工作目录:** `/home/peleclic/workspace/soit`
> **Wave:** 1(与 M1 并行,文件不相交)

---

### Task 2.1: DTO 加字段

**Files:**
- Modify: `src-tauri/src/universe/dto.rs`
- Modify: `src-tauri/src/universe/snapshot.rs`
- Modify: `src/types.ts`

- [ ] **Step 1: dto.rs**
```rust
// InquiryNodeDto 末尾加(serde rename_all="camelCase" 已存在,输出 createdAt/updatedAt):
pub created_at: String,
pub updated_at: String,

// TurnDto 末尾加:
pub created_at: String,
```

- [ ] **Step 2: snapshot.rs SELECT 扩展**

cards 查询(SELECT 行加两列,`row.get` 序号顺延):
```rust
"SELECT id, title, parent_id, kind, unread, status, question, stuck, next_step,
        created_at, updated_at
 FROM cards ORDER BY created_at ASC, id ASC"
```

turns 查询:
```rust
"SELECT id, card_id, title, collapsed, user_text, ai_html, think, think_open,
        COALESCE(starred, 0), COALESCE(process_json, '[]'), created_at
 FROM turns ORDER BY sort_order ASC, created_at ASC, id ASC"
```
相应 `InquiryNodeDto { ..., created_at: row.get(9)?, updated_at: row.get(10)? }`、`TurnDto { ..., created_at: row.get(10)? }`。

- [ ] **Step 3: types.ts(向后兼容 optional)**
```ts
// InquiryNode 接口:
createdAt?: string;
updatedAt?: string;

// Turn 接口:
createdAt?: string;
```

- [ ] **Step 4: cargo check 找全部构造点并补齐**

所有 `InquiryNodeDto {` / `TurnDto {` 字面量(预计:`mutations.rs` 里 TurnDto 构造、mcp/tools.rs 测试、lib.rs 测试)按编译器报错逐一补 `created_at`/`updated_at`(取 `String::new()` 或测试实际值 —— **测试 seed 用真实时间串**即可)。

```bash
cd /home/peleclic/workspace/soit/src-tauri && cargo check 2>&1 | grep -E "error|--> " | head -30
```

- [ ] **Step 5: 测试 + commit**
```bash
cd /home/peleclic/workspace/soit/src-tauri && cargo test 2>&1 | tail -15
cd /home/peleclic/workspace/soit && npm test 2>&1 | tail -8
git add src-tauri/src/universe/dto.rs src-tauri/src/universe/snapshot.rs src/types.ts
git add -A src-tauri/src  # 若构造点落在其他文件
git commit -m "feat(host): expose card/turn createdAt and card updatedAt in DTOs"
```

---

## Acceptance

- [ ] `cargo check` / `cargo test` 绿;`npm test` 绿
- [ ] `snapshot()` 返回的每卡有非空 `createdAt`/`updatedAt`;每 turn 有非空 `createdAt`
- [ ] FE `npm run build` 通过(types.ts optional 字段不破坏现有用法)
- [ ] 1 个 commit
