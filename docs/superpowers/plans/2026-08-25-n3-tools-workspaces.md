# Plan N3: tools.rs 多工作区参数 + 2 新工具

> **For agentic workers:** 独占 tools.rs。0.3d。依赖 N2。
> **Spec:** `docs/superpowers/specs/2026-08-25-mcp-multi-workspace-spec.md` §2.3(v1.1)
> **工作目录:** `/home/peleclic/workspace/soit`

---

### Task 3.1: call_tool 签名与分发

**Files:**
- Modify: `src-tauri/src/mcp/tools.rs`

- [ ] **Step 1: call_tool 换签名**

```rust
// 旧: pub fn call_tool(name: &str, arguments: Option<&Value>, universe: &Universe) -> ToolResult
// 新: pub fn call_tool(name: &str, arguments: Option<&Value>, state: &mut McpState) -> ToolResult
// 内部分发:
//   "list_workspaces" / "select_workspace" → 直接处理(不 resolve)
//   其余 5 工具 → let universe = state.resolve_vault(arguments)?; → 旧逻辑
//   错误返回 error_text(带 list_workspaces 提示)
```

注意:N2 已把 `handle_line`/`dispatch` 切到 `&mut McpState`,本步把 `tools.rs` 的函数体接上(避免两 plan 间签名漂移 —— 以当前仓库实际状态为准,先读再改)。

- [ ] **Step 2: list_workspaces / select_workspace**

```rust
// list_workspaces: 返回 [{path, label(叶子文件名), isLast}]
//   纯注册表(allowlist 原始串,不打开 DB);isLast = path == state 当前 lastVault
//   需要 lastVault:McpState 加字段 last_vault: Option<PathBuf>(N2 构造时传入;
//   若无则从 recents 读到的 last 为准;N2 没留的话本步补 —— 注意与 N2 的
//   McpServeConfig.default 区分:default 是选中语义,last_vault 是展示语义)
// select_workspace: {path} 必填;canonicalize → is_allowed 校验 → selected = Some(canon)
//   白名单外且非 allow-any → error_text(可读:列 list_workspaces)
```

- [ ] **Step 3: 5 工具 inputSchema 加可选 `vault`**

```rust
// 每个 schema properties 加 "vault": { "type": "string",
//   "description": "Optional vault path override. Defaults to the selected workspace." }
// 描述文字照 spec §2.3
```

- [ ] **Step 4: 测试**

必补:`list_workspaces` 空注册表 → 空数组;`select_workspace` 白名单外拒绝;`select` 后无 vault 参数走 B;`vault=A` 覆盖;未 select 多库报错;单库自动 fallback;canonicalize 匹配(`..` 拒绝);allow-any 放行。测试用 temp vault seed(参考现有 seed_vault 模式;open_readonly 需要 `.soit/universe.db`,用 `Universe::open` 先建再以 registry 打开)。

- [ ] **Step 5: commit**
```bash
cd /home/peleclic/workspace/soit && git add src-tauri/src/mcp/tools.rs
git commit -m "feat(mcp): list_workspaces + select_workspace + per-call vault param"
```

---

## Acceptance

- [ ] 7 工具全在 tool_definitions;5 工具 schema 含 `vault` 参数
- [ ] `call_tool(name, args, &mut McpState)` 落地,分发正确
- [ ] 验收标准 §6 中「未 select 多库报错 / select 会话态 / vault 覆盖 / 白名单拒绝 / allow-any / 空注册表」全部有对应测试
- [ ] 1 个 commit
