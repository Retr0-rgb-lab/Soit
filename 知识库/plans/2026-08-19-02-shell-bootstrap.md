# Plan 02: Shell + Bootstrap + Frozen Store API

> **For agentic workers:** Independent after Plan 01. Commit when done.  
> **Spec:** v1.1 §2.2–2.3, §2.5  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** 1b · **Depends:** Plan 01 · **Blocks:** Plan 03, 04

**Goal:** 三栏壳首帧可点；`host.ts` mock/Tauri 双路径；冻结 `types.ts` + `workspaceStore` 公共 API（可先 stub 实现）；Rust bootstrap/vault 桩 commands。

**Tech Stack:** React, Zustand（推荐）或最小 context, Tauri commands

## Global Constraints

- 先 paint 再 invoke；无重 IO on boot
- `host.ts` 无 Tauri 时 mock
- 禁止 CDN 字体；system-ui 栈
- Store API 签名本 plan 冻结后 03/04 不得改名改语义
- identifier / 标题维持 Plan 01

---

### Task 1: types + host + Rust commands

**Files:**
- Create: `src/types.ts`, `src/lib/host.ts`, `src/lib/demoSeed.ts`（可仅 export 空壳类型相关）
- Modify: `src-tauri/src/lib.rs` (or main), capabilities

**Interfaces:**
- Produces:

```ts
// src/types.ts
export type NodeKind = "root" | "deepen" | "diverge";

export interface InquiryNode {
  id: string;
  title: string;
  parentId: string | null;
  kind: NodeKind;
  unread: boolean;
}

export interface Turn {
  id: string;
  title: string;
  collapsed: boolean;
  user: string;
  aiHtml: string; // may contain <span class="mark" data-term="...">
  think: string;
  thinkOpen: boolean;
}

export interface WorkspaceSnapshot {
  source: "demo" | "empty";
  nodes: InquiryNode[];
  turnsByCardId: Record<string, Turn[]>;
  focusId: string;
}

export interface BootstrapState {
  phase: "ready_ui";
  vault: string | null;
  version: string;
}

export interface SelectVaultResult {
  ok: boolean;
  path: string;
  error?: string;
}
```

```ts
// src/lib/host.ts
export declare function getBootstrapState(): Promise<BootstrapState>;
export declare function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot>;
export declare function selectVault(path: string): Promise<SelectVaultResult>;
```

- [ ] **Step 1: 写 `src/types.ts`** 完全按上面 Interfaces。

- [ ] **Step 2: 实现 `host.ts`**

```ts
import type { BootstrapState, SelectVaultResult, WorkspaceSnapshot } from "../types";

function hasTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    || typeof window !== "undefined" && "__TAURI__" in window;
}

export async function getBootstrapState(): Promise<BootstrapState> {
  if (!hasTauri()) {
    return { phase: "ready_ui", vault: null, version: "dev-mock" };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<BootstrapState>("get_bootstrap_state");
}

export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  if (!hasTauri()) {
    const { demoSnapshot } = await import("./demoSeed");
    return demoSnapshot();
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<WorkspaceSnapshot>("get_workspace_snapshot");
}

export async function selectVault(path: string): Promise<SelectVaultResult> {
  if (!hasTauri()) {
    return { ok: false, path, error: "select_vault requires tauri" };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<SelectVaultResult>("select_vault", { path });
}
```

（`hasTauri` 检测以实际 Tauri 2 为准，可用 `@tauri-apps/api/core` 的官方推荐方式。）

- [ ] **Step 3: Rust commands**

在 `src-tauri` 注册：

```rust
#[tauri::command]
fn get_bootstrap_state() -> BootstrapState { /* phase ready_ui, vault None, version env! */ }

#[tauri::command]
fn get_workspace_snapshot(state: tauri::State<AppState>) -> WorkspaceSnapshot {
  // if no vault: return serde demo JSON embedded or minimal empty with source
}

#[tauri::command]
fn select_vault(path: String, state: tauri::State<AppState>) -> SelectVaultResult {
  // std::path::Path::new(&path).exists() -> ok + store in Mutex<Option<String>>
}
```

Demo JSON 可嵌在 Rust 或让 snapshot 在无 vault 时由前端 seed 填充：若 Rust 返回 empty，前端 `loadSnapshot` 可 fallback demo。**推荐：** Rust `get_workspace_snapshot` 无 vault 时返回 `source: "demo"` 且 nodes 可为 `[]`，前端再用 `demoSeed` 填满——更简单则 Rust 直接返回完整 demo serde。

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/lib/host.ts src-tauri
git commit -m "feat: add host bridge and bootstrap Tauri commands"
```

---

### Task 2: Store API skeleton + AppShell

**Files:**
- Create: `src/state/workspaceStore.ts`, `src/lib/demoSeed.ts`, `src/styles/tokens.css`, `src/styles/app.css`, `src/components/shell/AppShell.tsx`, `src/components/shell/LeftRail.tsx`, `src/components/shell/RightGraph.tsx` (placeholders)
- Modify: `src/App.tsx`, `src/main.tsx`

**Interfaces:**
- Produces store（实现可暂部分 stub，但函数必须存在且可调用）：

```ts
// workspaceStore public API
loadSnapshot(snap: WorkspaceSnapshot): void
focusNode(id: string): void
spawnDeepen(sourceLabel: string): string  // returns new id
spawnDiverge(sourceLabel: string): string
regenerateTurn(turnId: string): void
deleteTurn(turnId: string): void
toggleTurnCollapsed(turnId: string): void
appendUserMessage(text: string, quote?: string): void
// getters via hook: useWorkspace() => { nodes, turnsByCardId, focusId, focusNode, ...actions }
```

- [ ] **Step 1: `demoSeed.ts`**

从 `知识库/design/prototype-workspace.html` 移植种子：至少 5 节点（c1..c5）、函子卡两轮对话、aiHtml 含 `class="mark" data-term="函子"` 等。

- [ ] **Step 2: `workspaceStore.ts`**

使用 `zustand`（`npm install zustand`）实现上述 API。`spawn*` 必须新建 node + 初始 turn 并 `focusId = newId`。`regenerateTurn` 不新增 node。

- [ ] **Step 3: tokens + AppShell**

三栏 CSS grid：左 ~196px、中 1fr、右 ~220px。暖纸色，**system-ui** 字体栈。LeftRail/RightGraph 可先静态占位文字 “rail” / “graph”。

- [ ] **Step 4: App 启动路径**

```tsx
// App.tsx
useEffect(() => {
  (async () => {
    await getBootstrapState();
    const snap = await getWorkspaceSnapshot();
    if (snap.nodes.length === 0) loadSnapshot(demoSnapshot());
    else loadSnapshot(snap);
  })();
}, []);
// first render: shell immediately even if loading
```

- [ ] **Step 5: 验证**

```bash
npm run dev
```

Expected: 浏览器打开可见三栏壳，无控制台红错。

```bash
npm run tauri dev
```

Expected: 同壳 + bootstrap 可调用。

- [ ] **Step 6: Commit**

```bash
git add src package.json package-lock.json
git commit -m "feat: app shell, host mock path, frozen workspace store API"
```

---

## Acceptance

- [ ] 无 Tauri 时 `npm run dev` 可渲染壳 + demo（经 mock）
- [ ] `get_bootstrap_state` 同步逻辑无 sleep/重 IO
- [ ] store 公共 API 全部 export，签名稳定
- [ ] 2 commits（或 1 个清晰 commit）
