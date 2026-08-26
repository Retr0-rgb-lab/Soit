# 内置技能换血:对话方法类(苏格拉底 / 费曼 / 类比 / 回想)— Spec v1.1

> 日期: 2026-08-25
> 依据: 用户拍板「skills 机制保留,内置技能换为对话方法类;主轨 Agent 工作范围 = 项目对话,不带整理卡片/整理 Obsidian 技能」;`知识库/docs/共识.md` §6;`inquiry-tools-search-spec.md` §7(写卡树工具 v1 明确排除);主轨工具面实证(`src/lib/tools/defs.ts` 仅 3 只读工具)
> 基线分支: `main`(HEAD = c598b41)
> 前置依赖: skills 子系统(Wave E,`src-tauri/src/skills.rs`);read-ergonomics / multi-workspace 已落地(不影响本变更)

---

## 摘要

内置 seed 的两个技能 `organize-cards`(整理卡片宇宙)与 `organize-obsidian`(整理 Obsidian 库)要求 Agent 做它**根本没有工具支撑**的事:主轨工具目录只有 `vault_search` / `fetch_url` / `web_search` 三件只读工具,建卡/删卡/沉淀都是 UI 侧 IPC 命令,对 Agent 零暴露。这两个技能注入上下文纯属空转。本 Spec 把 seed 换成 **4 个纯对话行为技能**(苏格拉底式提问 / 费曼输出评价 / 类比引导 / 回想式提问),机制(list/enable/inject/UI/软上限)全部保留。主轨 Agent 的工作范围锁定为「项目对话」。

## 0. 前置依赖

| 已有 | 路径 |
|------|------|
| skills 子系统 | `src-tauri/src/skills.rs`(index / seed / toggle / inject,软上限 32768) |
| seed 调用 | `ensure_on_open` → `seed_skill_if_missing`(每次 open_universe) |
| 注入 | `src/state/turnHelpers.ts::withSkillsSystem` → `get_enabled_skills_text` |
| 默认启用 | `is_enabled`:`state.enabled.get(id).unwrap_or(true)` —— 未登记 id 视为启用 |
| UI | `SkillsList.tsx` 纯列表渲染,无硬编码 id |
| 主轨工具面 | `src/lib/tools/defs.ts`:3 只读工具;`spawn_inquiry`/`delete_inquiry`/`precipitate_concept`/`append_residue` 均 UI 侧 |

## 1. 现状

### 1.1 旧 seed 与工具面不匹配(实证)

| 旧技能 | 声称能力 | 实际工具面 | 结论 |
|--------|----------|-----------|------|
| `organize-cards`(skills.rs:12) | 归并重复线、归档完成探究、理 parent 关系 | 无任何写卡树工具 | 空转,只能口头建议用户点 UI |
| `organize-obsidian`(skills.rs:28) | 整理 concepts/inquiry、对齐链接 | 沉淀命令仅 UI 侧 | 空转 |

E2E 报告「假建卡回归」(模型声称 success:true,图不变)正是同一本质:没有工具,只有嘴。

### 1.2 代码锚点

| 文件 | 位置 | 现状 |
|------|------|------|
| `src-tauri/src/skills.rs` | :12-44 两个 `SEED_*` 常量;:87-88 seed 调用 | 旧 seed |
| `src-tauri/src/lib.rs` | :653-654 断言 organize-* 文件存在 + `list.len()==2` | 旧断言 |
| `src-tauri/src/skills.rs` | :352-378 `ensure_seeds_and_list_toggle`(含注入文本断言 :374 "Allowed tools/Intent/整理");:411-421 soft-cap 测试 | 旧测试 |
| `知识库/docs/共识.md` | §6「内置先做两件事:整理卡片宇宙、整理 Obsidian 库」 | 旧共识 |
| `知识库/docs/非目标.md` | 无对应条目 | 缺 |
| `src-tauri/AGENTS.md` | :15 skills.rs 描述(无 seed 清单) | 需补一句 |

## 2. 需要做的工作

### 2.1 共识先行(P0,先于代码)

**`知识库/docs/共识.md` §6 改写:**

> v1 技能 = 可修改的 **SKILL.md**。内置 **4 个对话方法技能**:苏格拉底式提问、费曼输出评价、类比引导、回想式提问。它们只作用于 **对话行为**(怎么问、怎么评价、怎么讲),不提供卡片树写操作、不整理 Obsidian 笔记。主轨 Agent 的工作范围 = 项目对话;建卡/删卡/沉淀走产品 UI(或未来正式工具 API)。Agent 能启用/停用/改写技能;人改文件即生效;v1 无代码插件、无插件市场。

决策表 **Q12(共识 :204)** 同步改为「内置 = 对话方法类技能(苏格拉底/费曼/类比/回想)」;§7 闭环「Obsidian 整理体系」条目保持不动(写库工具仍在,非本 spec 范围)。

**`知识库/docs/非目标.md` v1 不做加一条:**

> 主轨 Agent 内置「整理卡片宇宙」「整理 Obsidian 库」类技能(无对应工具,空转);写卡树/沉淀类 Agent 工具(v1 无,建卡只能 UI)

### 2.2 新 seed 文案(P0)

4 个新常量替换 `SEED_ORGANIZE_CARDS` / `SEED_ORGANIZE_OBSIDIAN`(每个正文 ≤1.5KB,4 个合计 ≤6KB,远低于 32KB 软上限)。frontmatter 沿用现有格式(`---\nname: …\ndescription: …\n---\n\n正文`),name 与目录 id 一致:

| id | name | 正文要点(fixer 按此写) |
|----|------|------------------------|
| `socratic-questioning` | 苏格拉底式提问 | 一次一个问题;先澄清概念再问证据;暴露隐含假设;用用户自己的话复述再追问;不直接给答案,不连续轰炸 |
| `feynman-explanation` | 费曼输出评价 | 邀请用户用自己的话解释;揪出术语伪装、逻辑跳跃、卡壳点;评分式反馈(讲清/含糊/错);给重讲建议;不代写 |
| `analogy-tutor` | 类比引导 | 用类比辅助理解;主动声明类比边界与失效处;一个类比讲完让用户复述检验;类比不替代精确定义 |
| `recall-quiz` | 回想式提问 | 间隔抽问已学内容;从"上次聊到 X"开始;用户答不出给线索阶梯,不给全文;频率克制,用户可喊停 |

**正文写作约束**:不得含 `---` 分隔线(`parse_skill_md` 会当 frontmatter 结束截断正文);不得含 "Allowed tools" 段(新技能无工具,纯对话方法);id 用 kebab-case(通过 `is_safe_skill_id`)。

### 2.3 seed 调用与老库兼容(P0)

- `ensure_on_open` 改为 seed 上述 4 个 id
- **老库**:盘上已存在的 `organize-cards/`、`organize-obsidian/` 目录**不主动删、不覆盖**(用户可能改过);它们仍会被 `list_skills` 列出,用户手动删。共识 §6 附一句「旧版 organize-* 技能已废弃,可手动删除」
- `seed_skill_if_missing` 逻辑不变(文件存在即跳过)

### 2.4 测试与契约更新(P0)

| 文件 | 变更 |
|------|------|
| `src-tauri/src/lib.rs:653-654` | 断言改 4 个新 skill 文件 + `list.len()==4` |
| `src-tauri/src/skills.rs:352-378` | `ensure_seeds_and_list_toggle`:seed 文件断言 + `list.len()==4` + toggle(find/false)+ 注入文本断言换词 + re-seed marker 保留 |
| `src-tauri/src/skills.rs:411-421` | `enabled_skills_text_soft_cap`:写大文件到新 id + 禁用其余 3 seed + 断言 contains 新 id |
| `src-tauri/AGENTS.md:15` | skills.rs 描述加「seed 4 个对话方法技能;不内置写卡树/整理库技能」 |

### 2.5 验证(P0)

- `npm test` / `npm run build`(FE 无改动,回归确认)
- `cargo test`(Linux libdbus 挡 → stub 验证 seed/parse/soft-cap 纯逻辑;Windows 全量)
- 注入总量检查:4 个 seed 正文合计 ≤6KB

## 3. 文件变更清单

| 文件 | 变更 | 节 |
|------|------|-----|
| `知识库/docs/共识.md` | §6 改写 + 废弃注记 | 2.1 |
| `知识库/docs/非目标.md` | + 一条 | 2.1 |
| `src-tauri/src/skills.rs` | 4 新 SEED 常量、ensure_on_open、测试 | 2.2 2.3 2.4 |
| `src-tauri/src/lib.rs` | 测试断言 | 2.4 |
| `src-tauri/AGENTS.md` | 描述一句 | 2.4 |

**不改:** skills 机制(list/enable/inject/UI/软上限)、`precipitate_concept`/`append_residue`(UI 侧,非 skill)、主轨工具目录、MCP。

## 4. 架构图

```text
open_universe → ensure_on_open
                 ├─ seed 4 对话方法技能(SKILL.md ≤1.5KB each)
                 └─ 老 organize-* 若存在 → 不动(用户自删)
                              │
list_skills ← SkillsList UI(启用/停用)
                              │
get_enabled_skills_text(默认全启用)→ withSkillsSystem → 注入主轨对话
                              │
主轨工具面不变:vault_search / fetch_url / web_search(只读)
Agent 行为边界 = 对话方法(问/评/讲);建卡删卡沉淀仍走 UI
```

## 5. 实施顺序

| 阶段 | 任务 | 依赖 | 工作量 |
|------|------|------|--------|
| W1 | S1 共识 + 非目标 | — | 0.1d |
| W2 | S2 skills.rs seed 换血 + 测试更新 | S1 | 0.3d |
| W3 | S3 AGENTS + verify + 提交 | S2 | 0.1d |

单 fixer 串行即可(总量 0.5d);S1 文档与 S2 代码文件不相交,可同 fixer 顺序做。

## 6. 验收标准

- [ ] 新库 open 后 `.soit/skills/` 下恰好 4 个新 id 目录,无 organize-*
- [ ] `list_skills` 返回 4 条;默认全部 enabled(未登记 id → true 语义不变)
- [ ] 4 份 SKILL.md frontmatter 合法(name = id、description 非空),正文 ≤1.5KB each
- [ ] `get_enabled_skills_text` 合计 ≤6KB,注入含全部 4 份正文
- [ ] 老库场景:预置 organize-cards 目录 → open 后不被删不被覆盖;list 含旧 + 新
- [ ] `lib.rs:653-654` 断言 4 新文件 + `list.len()==4`
- [ ] `skills.rs` `ensure_seeds_and_list_toggle` 全部断言换新 id:seed 文件、toggle(find/false)、注入文本断言(去掉 "Allowed tools/Intent/整理"，改为新技能正文实际词)、re-seed marker 保留
- [ ] `skills.rs` `enabled_skills_text_soft_cap`:写大文件到新 id + 禁用其余 3 个 seed + 断言 contains 新 id
- [ ] 本机 stub 验证;Windows cargo test 全量
- [ ] `npm test` / `npm run build` 绿
- [ ] 共识 §6 新文案落地;非目标含新条目;AGENTS.md 描述更新
- [ ] 技能正文不含任何「创建卡片/删除卡片/写入 Obsidian/整理笔记」指令(范围自检)

## 7. 不在范围

- skills 机制增删(无市场、无代码插件、无 GUI 编辑器 —— 均不变)
- 主轨写卡树/沉淀工具(仍 v1 排除;本 Spec 只换 seed 内容)
- MCP / read-ergonomics / multi-workspace 任何改动
- UI 文案/样式(纯列表渲染已够)
- 删老库盘上的 organize-* 文件(用户手动)

## 8. 风险

| 风险 | 缓解 |
|------|------|
| 4 技能默认全启用,注入变长 | 正文 ≤1.5KB/个,合计 ≤6KB;软上限 32KB 余量大 |
| 老库 6 技能混列(旧 2 + 新 4) | 共识标注废弃;用户手动删;不自动删(尊重用户文件) |
| 技能正文写得像"任务清单"而非对话方法 | spec §2.2 给行为要点;验收含范围自检 |
| 苏格拉底/回想类技能与系统提示已有引导重复 | 系统提示是工具策略/格式,技能是教学方法,分工不冲突;若冲突以系统提示优先(fixer 写文案时避免工具类指令) |

## 9. 版本变更

| 版本 | 说明 |
|------|------|
| v1.0 | 初稿:4 对话方法技能换血、老库不动、范围锁定对话 |
| v1.1 | Oracle APPROVE-WITH-MINOR:注入文本断言(:374)与 soft-cap 测试(:418 禁用其余 seed)细节、共识 Q12 决策表同步、正文禁 `---` 分隔线、systemPrompt 已封死建卡的补充事实 |
