# 反向只读 MCP — 实施计划（P0 stdio）

> Spec: `docs/superpowers/specs/2026-08-24-mcp-readonly-spec.md` v1.0
> 分支: main · Rust 侧内聚，单切片单写者（不并行拆，避免同 tree 编译冲突）

## 交付

`soit mcp serve --vault <path>` 只读 stdio MCP server。

## 文件所有权

| 文件 | 变更 |
|------|------|
| `src-tauri/src/mcp/mod.rs` | 新建 — 入口 + stdio 循环 |
| `src-tauri/src/mcp/jsonrpc.rs` | 新建 — JSON-RPC 类型/帧 |
| `src-tauri/src/mcp/tools.rs` | 新建 — 工具 schema + 处理器 |
| `src-tauri/src/mcp/`（内联 `#[cfg(test)]`） | 新建 — 单测 |
| `src-tauri/src/universe/mod.rs` | 新增 `open_readonly`（不改既有方法签名） |
| `src-tauri/src/main.rs` | 子命令分派 |
| `src-tauri/src/lib.rs` | `pub mod mcp;` |

## 冻结契约

```rust
// src-tauri/src/mcp/mod.rs
pub fn run_stdio_serve(vault: &std::path::Path) -> Result<(), String>;

// src-tauri/src/universe/mod.rs
impl Universe { pub fn open_readonly(vault: &Path) -> Result<Self, String> }
```

## 客户端接入（交付后用户配置示例）

Kimi Code `~/.kimi-code/mcp.json`:

```json
{
  "mcpServers": {
    "soit": {
      "command": "app.exe",
      "args": ["mcp", "serve", "--vault", "E:\\学习软件\\Soit\\你的vault"]
    }
  }
}
```

Claude Code: `claude mcp add soit -- app.exe mcp serve --vault "..."`

Cursor `.cursor/mcp.json`: stdio `type:"stdio"`，字段同 Kimi。

## 验证

```
cd src-tauri && cargo check && cargo test
```

## 边界

- 无新 Cargo 依赖
- 不改 `universe` 既有方法签名 / 迁移 / 命令
- 不碰前端 `src/`、不碰 `知识库/`（共识补丁已在 spec 前完成）
- Windows `windows_subsystem="windows"` 下 stdio 走父进程 pipe，`std::io::stdin()/stdout()` 正常；手测确认
