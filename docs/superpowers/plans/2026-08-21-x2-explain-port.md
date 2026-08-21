# Plan X2: resolveExplainPort + explainSpan

> **For agentic workers:** Wave 2；依赖 X1 已合入 `resolveExplainConfig`；不改 settings UI  
> **Spec:** `docs/superpowers/specs/2026-08-21-model-assignment-spec.md` v1.1 §2.3  
> **工作目录:** `E:\学习软件\Soit`  
> **Owns:** `src/lib/chat/index.ts`（只加 `resolveExplainPort` 函数体）, `src/state/explainActions.ts`, `src/state/explainActions.test.ts`  
> **Do not touch:** `modelSettings.ts`, `chat_config.rs`, `types.ts`, settings UI, `workspaceStore.test.ts` 的 `resolvePort` mock, `runCompletion.ts`

**前置：** `git log` / 读 `modelSettings.ts` 确认 `resolveExplainConfig` 已存在。若 X1 未完成则停，不要自己实现数据层。

---

### Task X2.1: resolveExplainPort

**Files:**
- Modify: `src/lib/chat/index.ts`

- [ ] **Step 1:** 在 `resolvePort` 旁新增（catch **禁止**抄 `readChatConfigFromLocalStorage`）：

```ts
export async function resolveExplainPort(
  configOverride?: ChatConfig | null,
): Promise<ChatPort> {
  if (configOverride) return portFromConfig(configOverride);
  try {
    const { getModelSettings } = await import("../host");
    const settings = await getModelSettings();
    return portFromConfig(resolveExplainConfig(settings));
  } catch {
    return portFromConfig(
      resolveExplainConfig(readModelSettingsFromLocalStorage()),
    );
  }
}
```

确保 `resolveExplainConfig` 与 `readModelSettingsFromLocalStorage` 已从 `./modelSettings` import（X1 应已 re-export；本函数体放 `index.ts`）。

- [ ] **Step 2:** `resolvePort()` 函数体 **一字不改**。

- [ ] **Step 3: Commit**
```bash
git add src/lib/chat/index.ts
git commit -m "feat(chat): resolveExplainPort from explainModelId slot"
```

---

### Task X2.2: explainSpan 改走 explain port

**Files:**
- Modify: `src/state/explainActions.ts`
- Modify: `src/state/explainActions.test.ts`

- [ ] **Step 1:** `explainActions.ts` import `resolveExplainPort` 替代 `resolvePort`。`explainSpan` 内 `const port = await resolveExplainPort();`。cache / `port.explain` / complete fallback / `stripThinkForExplain` 不变。

- [ ] **Step 2:** `explainActions.test.ts`：把 mock 从 `resolvePort` 换成 `resolveExplainPort`：

```ts
const resolveExplainPort = vi.fn();
const resolvePort = vi.fn();

vi.mock("../lib/chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/chat")>();
  return {
    ...actual,
    resolveExplainPort: (...args: unknown[]) => resolveExplainPort(...args),
    resolvePort: (...args: unknown[]) => resolvePort(...args),
  };
});
```

每个成功路径 `expect(resolvePort).not.toHaveBeenCalled()`。`afterEach` reset 两个 fn。原先 `resolvePort.mockResolvedValue(port)` 全部改为 `resolveExplainPort.mockResolvedValue(port)`。

**不要**改 `workspaceStore.test.ts`。

- [ ] **Step 3:** `npx vitest run src/state/explainActions.test.ts src/lib/chat/modelSettings.test.ts`

- [ ] **Step 4: Commit**
```bash
git add src/state/explainActions.ts src/state/explainActions.test.ts
git commit -m "feat(explain): short explain uses resolveExplainPort"
```

---

## Acceptance

- [ ] `explainSpan` 不调用 `resolvePort`
- [ ] catch 走 `resolveExplainConfig(LS)` 而非对话投影
- [ ] PEL-163 缓存测试仍过
- [ ] `workspaceStore.test.ts` 未改
- [ ] 2 个 commit
