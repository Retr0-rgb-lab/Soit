# Plan R5: 文档 + 回归验收

> **For agentic workers:** Wave 3 after R3+R4  
> **Spec:** `docs/superpowers/specs/2026-08-20-card-read-explain-spec.md` §2.6 §6  
> **工作目录:** `E:\学习软件\Soit`  
> **Owns:** AGENTS.md (card/overlays/lib), `知识库/docs/对象模型.md`, optional `共识.md`  
> **Do not touch:** feature code except tiny doc-driven fixes if tests fail

---

### Task R5.1: Product + AGENTS docs

**Files:**
- Modify: `知识库/docs/对象模型.md` — 下划线手势 step 3
- Modify: `知识库/docs/共识.md` — §2 loop one line (recommended)
- Modify: `src/components/card/AGENTS.md`
- Modify: `src/components/overlays/AGENTS.md`
- Modify: `src/lib/AGENTS.md`

- [ ] **Step 1:** 对象模型必改：短解释不建卡不落库；建卡须显式深挖/发散
- [ ] **Step 2:** 共识建议句：点下划线 → 短解释（可选）→ 选方向 → 新卡
- [ ] **Step 3:** AGENTS 同步 explainSpan / 安全子集 / overlay 无网络
- [ ] **Step 4: Commit**
```bash
git add "知识库/docs/对象模型.md" "知识库/docs/共识.md" src/components/card/AGENTS.md src/components/overlays/AGENTS.md src/lib/AGENTS.md
git commit -m "docs: card short-explain gesture and assistant HTML contracts"
```

---

### Task R5.2: Full verify

- [ ] **Step 1:** `npm test`
- [ ] **Step 2:** `npm run build`
- [ ] **Step 3:** Fix any regressions in owned files only
- [ ] **Step 4:** If fixes needed, commit:
```bash
git add -A && git commit -m "fix(card): explain/readability acceptance fixes"
```

---

## Acceptance

- [ ] Spec §6 checkboxes satisfied by tests + docs
- [ ] `npm test` + `npm run build` green
- [ ] 1–2 commits
