# Soit

本地 Agent Host：把会话探索系统化，碎片在软件里，一体探究在 Obsidian 里落成实存档。

知识库见 [`知识库/docs/`](./知识库/docs/)。  
本阶段规格：[`知识库/specs/2026-08-19-tauri-workspace-scaffold-spec.md`](./知识库/specs/2026-08-19-tauri-workspace-scaffold-spec.md)。

## 技术栈

- **壳：** Tauri 2（Rust）
- **UI：** Vite + React 18 + TypeScript
- **包管理：** npm（提交 `package-lock.json`）

## 环境要求

| 工具 | 说明 |
|------|------|
| Node.js | LTS（建议 20+） |
| npm | 随 Node 安装 |
| Rust | stable（`rustup`） |
| Windows | **WebView2** Runtime（Win10/11 通常已预装） |

### WebView2

若窗口无法启动，安装 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。

### 非 ASCII 路径

本仓库路径可能含中文（如 `E:\学习软件\Soit`）。多数情况下可直接开发；若 `tauri` / `cargo` / 链接器异常：

1. 将仓库克隆或 junction 到 **纯 ASCII 路径**（例如 `C:\dev\Soit`）再开发  
2. 以 ASCII 路径下的 `npm run tauri dev` 作为验收基准  
3. 在下方「环境笔记」记录失败现象

## 开发

```bash
npm install

# 仅前端（host.ts 走 mock，无需 Rust 窗口）
npm run dev

# 完整桌面（Tauri + Vite）
npm run tauri dev

# 前端生产构建
npm run build

# 桌面安装包 / release 可执行文件
npm run tauri build
```

窗口标题：**Soit** · identifier：`lab.soit.app`

## 启动策略

先出窗口与三栏壳 UI，vault / 宇宙 IO 延后。冷启动路径禁止阻塞式扫库与 CDN 字体。

## 环境笔记

| 日期 | 机器 | 路径 | 结果 |
|------|------|------|------|
| 2026-08-19 | Windows + rustc stable + Node LTS | `E:\学习软件\Soit`（含中文） | 见下方实测；若失败改用 ASCII 旁路 |

**Release 冷启动实测（P0 ≤2s）：** 待 Wave 3 `tauri build` 后填写。
