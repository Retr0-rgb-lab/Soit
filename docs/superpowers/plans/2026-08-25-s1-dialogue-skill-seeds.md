# Plan S1: 内置技能换血(4 对话方法 seed)

> **For agentic workers:** skills.rs 常量 + 测试换新 id + 文档同步,单文件主改。0.5d。
> **Spec:** `docs/superpowers/specs/2026-08-25-skill-seeds-dialogue-spec.md` §2.1–2.5(v1.1)
> **工作目录:** `/home/peleclic/workspace/soit`

---

### Task 1.1: 共识 + 非目标(先于代码)

**Files:**
- Modify: `知识库/docs/共识.md`
- Modify: `知识库/docs/非目标.md`

- [ ] **Step 1: 共识 §6 改写**(spec §2.1 的引文原样落),并同步决策表 Q12(共识 :204 附近「内置整理卡片/整理库」→「内置 = 对话方法类技能(苏格拉底/费曼/类比/回想)」)。§7 不动。
- [ ] **Step 2: 非目标 v1 不做加一条**(spec §2.1 引文)。

### Task 1.2: skills.rs seed 换血

**Files:**
- Modify: `src-tauri/src/skills.rs`

- [ ] **Step 3: 4 个新 SEED 常量**(替换 `SEED_ORGANIZE_CARDS` / `SEED_ORGANIZE_OBSIDIAN`)

```rust
const SEED_SOCRATIC_QUESTIONING: &str = r#"---
name: socratic-questioning
description: 苏格拉底式提问——澄清概念、暴露假设、追问证据
---
(正文 ≤1.5KB,按 spec §2.2 要点写)
"#;
// + SEED_FEYNMAN_EXPLANATION / SEED_ANALOGY_TUTOR / SEED_RECALL_QUIZ
```

正文写作约束(spec v1.1,必守):
- **不得含 `---` 行**(`parse_skill_md` 会把 `\n---` 当 frontmatter 结束截断正文)
- **不得含 "Allowed tools" 段**(纯对话方法,无工具)
- id kebab-case(过 `is_safe_skill_id`)
- 每份 ≤1.5KB,4 份合计 ≤6KB
- 内容纯对话行为(怎么问/怎么评/怎么讲),**不含**「创建卡片/删除卡片/写入 Obsidian/整理笔记」指令

- [ ] **Step 4: ensure_on_open 改 seed 4 个新 id**(skills.rs :87-88);`seed_skill_if_missing` 不动
- [ ] **Step 5: 测试更新**

`ensure_seeds_and_list_toggle`(:352-378)全部断言换新 id:
- seed 文件断言 → 4 新文件
- toggle:改用新 id(set false → find enabled=false)
- 注入文本断言(:372-374):旧断言 `contains("skill:organize-cards")`/`contains("Allowed tools")` 等 → 改新技能正文实际词(如 contains("苏格拉底")或英文对应词),**去掉 "Allowed tools/Intent/整理" 断言**
- re-seed marker 逻辑保留(证明文件存在不覆盖)

`enabled_skills_text_soft_cap`(:411-421):
- 大文件写到任一新 id(如 socratic-questioning)
- **禁用其余 3 个 seed**(set_skill_enabled false ×3)
- 断言注入文本 contains 该新 id 标记,不含其余 3 个

- [ ] **Step 6: lib.rs 测试断言更新(:653-654)**

```rust
// 4 个新文件 + list.len() == 4
assert!(dir.join(".soit/skills/socratic-questioning/SKILL.md").is_file());
assert!(dir.join(".soit/skills/feynman-explanation/SKILL.md").is_file());
assert!(dir.join(".soit/skills/analogy-tutor/SKILL.md").is_file());
assert!(dir.join(".soit/skills/recall-quiz/SKILL.md").is_file());
assert_eq!(list.len(), 4);
```

- [ ] **Step 7: 验证 + commit**

```bash
# cargo test 卡 libdbus(已知环境问题)—— 用 stub 验证 seed/parse/soft-cap 纯逻辑:
# 把 skills.rs 的 SEED 常量与 parse_skill_md 复制进临时 stub crate 跑断言
# (参考 read-ergonomics 的 stub 经验);parse 断言:4 份 frontmatter 合法、正文无 "---" 行
cd /home/peleclic/workspace/soit && npm test 2>&1 | tail -4
npm run build 2>&1 | tail -3
git add src-tauri/src/skills.rs src-tauri/src/lib.rs 知识库/docs/共识.md 知识库/docs/非目标.md
git commit -m "feat(skills): seed 4 dialogue-method skills (socratic/feynman/analogy/recall), drop organize seeds"
```

### Task 1.3: AGENTS 契约 + 收尾

**Files:**
- Modify: `src-tauri/AGENTS.md`

- [ ] **Step 8: :15 描述补一句**「seed 4 个对话方法技能;不内置写卡树/整理库技能(无对应工具)」
- [ ] **Step 9: commit**
```bash
cd /home/peleclic/workspace/soit && git add src-tauri/AGENTS.md
git commit -m "docs(agents): skills seed contract (dialogue-method only)"
```

---

## Acceptance

- [ ] 共识 §6 新文案 + Q12 同步;非目标新条目
- [ ] 新库 seed 恰好 4 个新 id;无 organize-*
- [ ] 4 份 frontmatter 合法;正文 ≤1.5KB each;无 `---` 行;无 "Allowed tools";无卡片/Obsidian 操作指令
- [ ] 注入合计 ≤6KB;soft-cap 测试语义保留(大文件截断 + 其余 3 禁用)
- [ ] 老库 organize-* 文件不被删不被覆盖(seed_skill_if_missing 逻辑未动 + re-seed marker 测试)
- [ ] `npm test` / `npm run build` 绿;stub 验证 seed/parse 通过;Windows cargo test 待办清单在报告里列出
- [ ] 2 个 commit
