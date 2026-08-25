# Plan N4: 文档 / AGENTS / skill 同步 + verify

> **For agentic workers:** 只碰文档与验证命令。0.3d。依赖 N3。
> **Spec:** `docs/superpowers/specs/2026-08-25-mcp-multi-workspace-spec.md` §2.4 + §6
> **工作目录:** `/home/peleclic/workspace/soit`

---

### Task 4.1: src-tauri/AGENTS.md MCP 段扩展

**Files:**
- Modify: `src-tauri/AGENTS.md`

- [ ] **Step 1:** 在既有 MCP 段(若无则命令表后)追加:

```markdown
## MCP 多工作区

- 注册表 = 显式 `--vault`(重复/逗号,绝对路径,保序去重)在前 + `soit-session.json` recents 补齐,总量 ≤8
- 权限:白名单默认拒绝;**不扫盘**;`--allow-any` 放开;比较前双向 `dunce::canonicalize`(防 `..`/symlink/Windows 大小写)
- CLI 进程无 AppHandle:`session_config_path_no_app()`(dirs crate + `lab.soit.app`)读 session
- 工具:`list_workspaces`(零 DB IO)/ `select_workspace`(会话态,进程重启丢失)/ 5 工具可选 `vault` 参数
- resolve 优先级:参数 vault > selected > 唯一白名单库 > 可读错误(list_workspaces 提示)
- 惰性 `open_readonly` + HashMap 缓存;打开失败带 path,不 crash
```

### Task 4.2: writeNotes skill

**Files:**
- Modify: `~/.agents/skills/soit-writeNotes/SKILL.md`(仓库外,不 commit)

- [ ] **Step 2:** 步骤 1「确认目标」中「用 `soit_list_cards` 确认」前插入:

```markdown
- 用 `soit_list_workspaces` 定位目标库(返回 path + label),然后 `soit_select_workspace(path)` 设为当前工作区;后续工具调用无需每次带 vault。
- 单工作区配置(MCP 启动带 `--vault`)可跳过此步。
```

### Task 4.3: verify + commit

- [ ] **Step 3:**
```bash
cd /home/peleclic/workspace/soit && npm test 2>&1 | tail -5
npm run build 2>&1 | tail -5
# cargo test 卡 libdbus 为已知环境问题 —— 在报告里列出待 Windows 验证的文件清单:
# src-tauri/src/main.rs / mcp/mod.rs / mcp/tools.rs / session_config.rs(新 helper)
git add src-tauri/AGENTS.md
git commit -m "docs(agents): MCP multi-workspace registry contract"
```

---

## Acceptance

- [ ] `npm test` / `npm run build` 绿
- [ ] AGENTS.md 含多工作区契约段
- [ ] skill 第 1 步含 list_workspaces → select_workspace
- [ ] 报告列出待 Windows cargo test 的完整文件清单
- [ ] 1 个 commit
