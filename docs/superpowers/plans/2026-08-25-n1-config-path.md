# Plan N1: config dir 独立解析 + CLI 多 vault 参数

> **For agentic workers:** 三个小文件,先行。0.3d。
> **Spec:** `docs/superpowers/specs/2026-08-25-mcp-multi-workspace-spec.md` §2.0 / 2.1(v1.1)
> **工作目录:** `/home/peleclic/workspace/soit`

---

### Task 1.1: dirs 依赖 + 无 AppHandle 的 session 路径

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/session_config.rs`

- [ ] **Step 1: Cargo.toml 加依赖**(确认 dirs 6.x 支持 rust 1.77)
```toml
dirs = "6"
```

- [ ] **Step 2: session_config.rs 加 helper**(先读现有 `config_path` 与 `migrate_session_value`)

```rust
/// MCP CLI 进程无 AppHandle —— 用 dirs 拼接 Tauri app_config_dir 等价路径。
/// identifier 权威来源:tauri.conf.json `identifier = "lab.soit.app"`。
pub fn session_config_path_no_app() -> Option<PathBuf> {
  let base = dirs::config_dir()?;  // Win: %APPDATA% | Linux: $XDG_CONFIG_HOME|~/.config | macOS: ~/Library/Application Support
  Some(base.join("lab.soit.app").join("soit-session.json"))
}

/// 读 session 文件为 raw Value;缺失/损坏 → None(静默降级,不 crash)。
pub fn read_session_raw_no_app() -> Option<Value> { /* fs::read_to_string + parse,err → None */ }
```

- [ ] **Step 3: 单测**(无需 AppHandle):缺失文件 → None;坏 JSON → None;正常 → 反序列化为 SessionConfigDto 成功。**注意**:`SessionConfigDto` 反序列化需要 `version` 字段 —— 用 `migrate_session_value` 兼容旧格式(缺 version 会 seed recents),测试直接调它。

### Task 1.2: CLI 解析

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 4: 重写 run_mcp**(按 spec §2.1 + v1.1 注册表规则)

```rust
/// `soit mcp serve [--vault <abs>]... [--vault A,B] [--allow-any]`
/// 注册表 = 显式 --vault(保序去重不截断)+ recents 去重补齐,总量 cap 8。
fn run_mcp(rest: &[String]) {
  // parse: explicit: Vec<String>(支持重复 + 逗号拆分),allow_any: bool
  // 无 --vault:recents = session_config::read_session_raw_no_app()
  //            → migrate_session_value → normalize_recent_vaults 取 recent_vaults
  // 显式路径必须绝对;相对 → eprintln + exit(2)
  // default = explicit.first().or(last_vault if in registry).or(None)
  // 调 app_lib::mcp::run_stdio_serve(McpServeConfig { registry, allow_any, default })
}
```

`McpServeConfig` 的构造放这里还是 mod.rs?**放 mod.rs**(N2 拥有),N1 先定义 CLI 侧的 struct 字面量 —— 为避免 N1/N2 串行等待,N1 里 `McpServeConfig` 结构体直接定义在 mod.rs?**不**:N1 与 N2 串行(同一 worker 顺序执行),N1 结束时 mod.rs 的 `run_stdio_serve` 签名由 N2 改。N1 最后一步只改 CLI 解析逻辑,调用处**先保留旧签名编译不过就留 TODO**?—— 不行,commit 必须能编译。

**修正:** N1 只做 Cargo.toml + session_config.rs(可独立编译、独立测试、独立 commit)。CLI 解析重写并入 N2(mod.rs 新签名就位后同 commit)。§5 实施顺序相应调整(N1 缩小为 config 层)。

- [ ] **Step 5: 测试 + commit**
```bash
cd /home/peleclic/workspace/soit/src-tauri && cargo test session 2>&1 | tail -15
# cargo 卡 libdbus 属已知环境问题(见父任务说明),用 stub 验证或人工核对,不装系统库
cd /home/peleclic/workspace/soit && git add src-tauri/Cargo.toml src-tauri/src/session_config.rs
git commit -m "feat(mcp): app-config session path for CLI process (no AppHandle)"
```

---

## Acceptance

- [ ] `dirs = "6"` 进 Cargo.toml;`cargo metadata` 或人工确认 MSRV 兼容 rust 1.77
- [ ] `session_config_path_no_app` 三平台语义与 Tauri `app_config_dir` 对齐(代码注释写明)
- [ ] 缺失/损坏文件 → None,不 panic
- [ ] 1 个 commit
