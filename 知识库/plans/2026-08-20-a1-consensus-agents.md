# Plan A1: 共识双轨 + AGENTS 预告

> **For agentic workers:** docs only; do not touch `src/` implementation beyond AGENTS.md  
> **Spec:** `docs/superpowers/specs/2026-08-20-agent-dual-track-spec.md` v1.1 §2.0 §2.10  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** 1 · 并行 · 无代码依赖

---

### Task 1.1: 共识补丁

**Files:**
- Modify: `知识库/docs/共识.md`
- Modify: `知识库/docs/对象模型.md`（可选一句 runs）

- [ ] **Step 1:** 在 §6 技能后或 §8 默认处增加 **Agent 双轨** 小节：
  - 主轨 Inquiry Assistant
  - 副轨 External Runtime（工具级 handoff）
  - 禁止外部 session 当卡片源；禁止 Soit-as-plugin 默认路径
- [ ] **Step 2:** 将 §8「v1 单 Agent + 工具」改为「单探究助手 + 可选外部 Runtime」
- [ ] **Step 3:** 决策表追加 Q15（双轨）
- [ ] **Step 4:** `对象模型.md` 进程树补一行：`vault/.soit/runs/` handoff 沙箱（非宇宙源）

- [ ] **Step 5: Commit**
```bash
git add "知识库/docs/共识.md" "知识库/docs/对象模型.md"
git commit -m "docs(consensus): dual-track inquiry assistant + external runtime"
```

---

### Task 1.2: AGENTS 预告

**Files:**
- Modify: `AGENTS.md`（root，若过长可只加一行指针）
- Modify: `src/lib/AGENTS.md`
- Modify: `src/state/AGENTS.md`
- Modify: `src-tauri/AGENTS.md`
- Modify: `src/components/shell/AGENTS.md`
- Modify: `src/components/card/AGENTS.md`

- [ ] **Step 1:** 各 AGENTS 增加双轨指针与「实现见 spec v1.1」；shell 五段含 runtime；card 含 export/handoff/stop；tauri 预告 runtime commands（实现可尚未存在）
- [ ] **Step 2: Commit**
```bash
git add AGENTS.md src/lib/AGENTS.md src/state/AGENTS.md src-tauri/AGENTS.md src/components/shell/AGENTS.md src/components/card/AGENTS.md
git commit -m "docs(agents): dual-track agent system pointers"
```

---

## Acceptance

- [ ] 共识可读出双轨与禁止项
- [ ] 无 `src/**/*.ts` 行为变更
- [ ] 2 commits
