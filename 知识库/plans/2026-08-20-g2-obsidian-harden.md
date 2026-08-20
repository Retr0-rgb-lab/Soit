# Plan G2: Obsidian writer hardening

> **Spec:** `知识库/specs/2026-08-20-host-hardening-and-durability.md` v1.0 §3.4、§7  
> **Depends:** none · **Parallel OK with:** G1, G3, G4

**Goal:** 沉淀保留用户 frontmatter；消毒；原子写；本地日期残渣；测试锁死。

## 可写

- `src-tauri/src/obsidian.rs` 或拆 `src-tauri/src/obsidian/**`  
- `src-tauri/src/lib.rs` **仅**若 `mod` 路径变更一行  
- 不改命令名/DTO 字段名（除非加可选字段）  

## 不可写

- `universe*`、FE、`tauri.conf.json`、skills  

---

### Tasks

- [ ] **G2.1** Frontmatter merge：保留未知键；只 upsert `soit_card_ids` + `soit_managed`  
- [ ] **G2.2** `yaml_escape` card_id；strip AUTO markers from title/question/hint  
- [ ] **G2.3** 原子写 concept（tmp + rename）  
- [ ] **G2.4** 本地时区 `today_ymd` / `now_hms`；residue 长度 cap 8000  
- [ ] **G2.5** 测试：tags 保留；marker 注入 title；yaml 特殊 card_id；slug 仍拒 `/\\`  
- [ ] **G2.6** 若 >700 行则按 Spec 拆模块；`cargo test`  

### 验收

- 预置 `tags: [a]` 的概念文件沉淀后 tags 仍在  
- `should_skip` 行为不回归（区外用户正文）  
