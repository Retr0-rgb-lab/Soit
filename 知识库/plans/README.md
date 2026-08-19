# Plans — Tauri 主工作区脚手架

> **Spec:** `知识库/specs/2026-08-19-tauri-workspace-scaffold-spec.md` v1.1  
> **工作目录:** `E:\学习软件\Soit`

## Wave 结构

| Wave | Plans | 并行 | 依赖 |
|------|-------|------|------|
| 1 | [01-scaffold](./2026-08-19-01-scaffold.md) → [02-shell-bootstrap](./2026-08-19-02-shell-bootstrap.md) | 串行 | — |
| 2 | [03-store-graph](./2026-08-19-03-store-graph.md) \|\| [04-inquiry-card](./2026-08-19-04-inquiry-card.md) | **并行** | Wave1 |
| 3 | [05-polish-verify](./2026-08-19-05-polish-verify.md) | 串行 | Wave2 |

## 文件所有权（防冲突）

| Plan | 可写 |
|------|------|
| 01 | 根脚手架、`src-tauri` 最小、`package.json`、README 初版 |
| 02 | `src/types.ts`、`src/lib/host.ts`、`src/state/workspaceStore.ts`（API 骨架）、`src/components/shell/*`、`src/App.tsx` 骨架、Rust commands |
| 03 | `src/state/*` 实现、`seed.ts`、`graphLayout.ts`、`LeftRail`、`RightGraph`、store 测试 |
| 04 | `src/components/card/*`、`src/components/overlays/*`、`marks.ts` |
| 05 | 动效 CSS、`App.tsx` 微调、README 启动实测、端到端核对 |

**禁止：** Plan 03/04 互相修改对方目录；Plan 03/04 不得改 store 公共方法签名（只实现/消费）。
