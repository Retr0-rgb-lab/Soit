# Soit

本地 Agent Host：把会话探索系统化，碎片在软件里，一体探究在 Obsidian 里落成实存档。

知识库见 [`知识库/docs/`](./知识库/docs/)。  
本阶段规格：[`知识库/specs/2026-08-19-tauri-workspace-scaffold-spec.md`](./知识库/specs/2026-08-19-tauri-workspace-scaffold-spec.md)。  
理念对齐 Wave A–F：[`知识库/specs/2026-08-20-philosophy-alignment-spec.md`](./知识库/specs/2026-08-20-philosophy-alignment-spec.md)。

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

Tauri 在 Windows 上依赖 **Microsoft Edge WebView2**。Win10/11 多数机器已预装；若 `tauri dev` / 打包 exe 无窗口或立刻退出，先安装：

- [WebView2 Runtime (Evergreen)](https://developer.microsoft.com/microsoft-edge/webview2/)

确认方式：设置 → 应用 → 搜索 “WebView2”，或打开任意 Edge 基应用。

### 非 ASCII / 中文路径

本仓库路径可能含中文（如 `E:\学习软件\Soit`）。Wave 1–3 在此路径下已跑通 `npm run dev`、`cargo check`、`tauri build --debug`。

若 `tauri` / `cargo` / 链接器异常（少见）：

1. 将仓库克隆或 junction 到 **纯 ASCII 路径**（例如 `C:\dev\Soit`）再开发  
2. 以 ASCII 路径下的 `npm run tauri dev` 作为验收基准  
3. 在下方「环境笔记」记录失败现象

## 如何运行

```bash
npm install

# 仅前端（host.ts 走 mock，无需 Rust / WebView2 窗口）
npm run dev

# 完整桌面（Tauri + Vite HMR）
npm run tauri dev

# 前端类型检查 + 生产 bundle
npm run build

# 单元冒烟
npm test
# 或: npx vitest run

# 桌面安装包 / release 可执行文件（较慢）
npm run tauri build
```

| 入口 | 说明 |
|------|------|
| `npm run dev` | 浏览器；mock bootstrap + demo 宇宙 |
| `npm run tauri dev` | 桌面窗标题 **Soit**；Rust commands + 本地前端 |
| `src-tauri/target/debug/app.exe` | debug 桌面产物（`tauri build --debug` 或 dev 编译后） |
| `src-tauri/target/release/` | release 产物（需先 `npm run tauri build`） |

窗口标题：**Soit** · identifier：`lab.soit.app`

## 启动策略

先出窗口与三栏壳 UI，vault / 宇宙 IO 延后。冷启动路径禁止：

- 阻塞式扫 vault / 开多个 DB  
- 任何模型或鉴权网络  
- **首屏 CDN 字体**（禁止 `fonts.googleapis.com`；使用系统字体栈）

## Startup verification

规格 P0：本机冷启动 release 产物，进程启动 → 三栏壳可点击 **≤ 2.0s**（不计 `tauri dev`/HMR）。

| 日期 | 机器概况 | 路径 | 测量对象 | 结果 |
|------|----------|------|----------|------|
| 2026-08-19 | Windows, rustc 1.92, Node 24 | `E:\学习软件\Soit`（含中文） | `npm run build` + `npx vitest run` | **PASS**（5 tests） |
| 2026-08-19 | 同上 | 同上 | 首屏 bundle / `index.html` | **无** `fonts.googleapis.com` / `fonts.gstatic` |
| 2026-08-19 | 同上 | 同上 | `src-tauri/target/debug/app.exe` 拉起 | 进程约 **1.5s** 内仍存活并可出窗（粗测：`Start-Process` 后 1.5s `HasExited=false`；**非**「到可点击壳」严格计时） |
| 2026-08-19 | 同上 | 同上 | **release 冷启动 ≤2s** | **未测**：本波次未跑完整 `npm run tauri build`（release 耗时长）。**不能诚实宣称 ≤2s 已达标**；待 release 产物后用秒表/脚本从进程启动到三栏可点再填 |

手测清单（`npm run tauri dev` 或 `npm run dev`）：

- [x] 三栏首屏（左列表 / 中卡 / 右图）无需先选 vault  
- [x] 点列表或图节点换卡（中卡 enter 动效；`prefers-reduced-motion` 下关闭）  
- [x] 深挖 / 发散长出新节点并 focus  
- [x] 标注下划线 → 浮层 → 深挖/发散  
- [x] 作曲条发送（内存）  
- [x] 重生只改当前轮、不增节点  
- [x] 左栏折叠按钮驱动 `rail-collapsed` 网格  

## 环境笔记

| 日期 | 机器 | 路径 | 结果 |
|------|------|------|------|
| 2026-08-19 | Windows + rustc 1.92 + Node 24 | `E:\学习软件\Soit`（含中文） | `cargo check` / `cargo test` / `tauri build --debug` / `app.exe` 启动均成功，**无需 ASCII 旁路** |

**Debug 构建产物路径：** `src-tauri/target/debug/app.exe`。

> 注：`identifier` 为 `lab.soit.app`（规格要求）。Tauri 会提示 macOS 上 `.app` 后缀不推荐；Windows 开发不受影响。
