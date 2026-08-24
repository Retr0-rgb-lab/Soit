# Plan D: Obsidian precipitate (concepts + residue)

> **For agentic workers:** Ownership only; commit `(plan-d)`; Diff Report at end.  
> **Spec:** v1.1 §Wave D  
> **工作目录:** assigned worktree  
> **Wave:** 1 · **Depends:** A · **Parallel with:** B, F (disjoint files)

## 0. Mission

Real write path: concept page + residue note with card id backlink; no full transcript mirror; no overwrite of user-edited concept body by default; replace fake bookmark/沉淀 toggle semantics.

## 1. Constraints

- Writes only under bound vault path from open universe.
- `concepts/{slug}.md` frontmatter must include `soit_card_ids: [cardId]`
- Residue under e.g. `inquiry/` or `residue/` append-only snippets + card id
- Never write per-card full chat md
- Overwrite guard: if concept body outside Soit markers changed (mtime/hash or missing `<!-- soit:auto -->` region), skip body overwrite; may update frontmatter ids only
- No skill market, no ChatPort
- Secrets: n/a

## 2. File ownership (ONLY)

| Path | Action |
|------|--------|
| `src-tauri/src/obsidian.rs` | **new** write_concept, write_residue, slugify, guard |
| `src-tauri/src/lib.rs` | register module + 2 commands only (`precipitate_concept`, `append_residue`) — do not rewrite universe/spawn |
| `src-tauri/permissions/bootstrap.toml` | two allow rules |
| `src-tauri/capabilities/default.json` | two entries |
| `src-tauri/src/obsidian.rs` tests | temp dir write/guard |
| `src/lib/host.ts` | only add `precipitateConcept`, `appendResidue` |
| `src/types.ts` | only add result DTOs at end of file if needed |
| `src/components/card/CardHeader.tsx` | replace bookmark toggle with 沉淀概念 / 残渣 actions |
| `src/components/card/EdgeActions.tsx` | if 收藏 exists, rename/remove |
| `src/components/card/InquiryCard.tsx` | wire handlers only if required |
| `src/styles` or `card.css` | minimal button styles |
| `知识库/docs/` or plan checkbox | optional short vault layout note |

**Forbidden:** edges/spawn redesign (B), ChatPort (C), skills (E), map, LeftRail vault rewrite.

**lib.rs rule:** only append commands + `mod obsidian` + handler entries. Do not reformat unrelated code.

## 3. Tasks

### D.1 Rust writers

```text
concepts/{slug}.md
---
soit_card_ids: ["c_..."]
soit_managed: true
---
<!-- soit:auto:start -->
... generated summary bullets from title/question ...
<!-- soit:auto:end -->

inquiry/{date}-residue.md or inquiry/{cardId}-notes.md append
```

### D.2 Commands

- `precipitate_concept { cardId, title, question?, bodyHint? }`
- `append_residue { cardId, text }`
- Require open universe; use vault_path

### D.3 UI

- Remove fake local-only 收藏 as “沉淀”
- Buttons: 「写入概念」「记下残渣」
- Demo/no-vault: disable with title explaining need bind vault

### D.4 Verify

```bash
cd src-tauri && cargo test
npm test
npm run build
```

Commit: `feat(obsidian): (plan-d) concept + residue precipitate`

## 4. Acceptance

- [ ] cargo test covers write + no-overwrite user body
- [ ] UI labels not “收藏卡片” as precipitate
- [ ] No per-card transcript file path exists in code

## 5. Diff Report

Same JSON shape as Plan B with `"plan":"D"`.
