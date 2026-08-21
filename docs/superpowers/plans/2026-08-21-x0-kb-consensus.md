# Plan X0: 知识库 — 目录 vs 用途槽

> **For agentic workers:** Wave 1 并行；只改 `知识库/docs/`；不改 `src/`  
> **Spec:** `docs/superpowers/specs/2026-08-21-model-assignment-spec.md` v1.1 §2.1  
> **工作目录:** `E:\学习软件\Soit`  
> **Owns:** `知识库/docs/共识.md`, `对象模型.md`, `非目标.md`, `explore-probe.md`  
> **Do not touch:** `src/**`, `src-tauri/**`, specs besides the four KB files

---

### Task X0.1: 共识 + 对象模型

**Files:**
- Modify: `知识库/docs/共识.md`
- Modify: `知识库/docs/对象模型.md`

- [ ] **Step 1:** In `共识.md` §1 身份，`支持 **BYOK**。` 后追加一句（不要新开记忆层小节）：

```markdown
BYOK **目录**（供应商 + 模型）与 **用途槽** 分开：卡片对话走对话槽；点词/划词短解释走短解释槽。未指定短解释时跟随对话模型。
```

- [ ] **Step 2:** `对象模型.md`「下划线手势」第 3 条改为：

```markdown
3. 点击标记或划词可先短解释（不建卡、不落库；所用模型来自本机 `explainModelId`，缺省跟随对话槽）；建卡仍须显式选深挖或发散。
```

- [ ] **Step 3: Commit**
```bash
git add 知识库/docs/共识.md 知识库/docs/对象模型.md
git commit -m "docs(kb): split BYOK catalog from chat vs explain slots"
```

---

### Task X0.2: 非目标 + explore-probe 映射

**Files:**
- Modify: `知识库/docs/非目标.md`
- Modify: `知识库/docs/explore-probe.md`

- [ ] **Step 1:** `非目标.md`「v1 不做」列表末尾加：

```markdown
- 不抄 Explore 功能性模型（标题/标注/总结绑一槽）与视觉槽
- 不抄倍率 / 档位 / 升级墙 / 对话模型拖拽白名单（v1）
```

- [ ] **Step 2:** `explore-probe.md` §2.6 表后（「自带密钥」行所在表结束后、`### 2.7` 前）加：

```markdown
Soit 映射（本机 BYOK，不抄商业）：对话性 → `activeModelId`；智能标注/短解释 → `explainModelId`（未指定则跟随对话）；功能性大杂烩与视觉槽 v1 不做。
```

- [ ] **Step 3: Commit**
```bash
git add 知识库/docs/非目标.md 知识库/docs/explore-probe.md
git commit -m "docs(kb): non-goals and Explore mapping for model slots"
```

---

## Acceptance

- [ ] 共识写明目录 vs 两槽；短解释缺省跟随对话
- [ ] 对象模型下划线手势写 `explainModelId`
- [ ] 非目标排除功能/视觉/白名单
- [ ] 不改任何 `src/` 文件
- [ ] 2 个 commit
