# Plan F: Naming fence + attention docs (shell freeze)

> **For agentic workers:** Docs + copy only; `(plan-f)`; Diff Report.  
> **Spec:** v1.1 §Wave F + §7  
> **工作目录:** assigned worktree  
> **Wave:** 1 · **Parallel with:** B, D

## 0. Mission

Enforce naming fence in remaining UI strings and document live-thread ≠ inquiry status; freeze map as navigation projection only.

## 1. File ownership (ONLY)

| Path | Action |
|------|--------|
| `知识库/docs/live-attention.md` | **new** 活线/停养 = 注意力集合，≠ card status |
| `知识库/docs/README.md` | link new doc if exists |
| `src/components/shell/LeftRail.tsx` | copy only: 停养 tooltip clarify; no vault logic rewrite |
| `src/components/shell/MapStage.tsx` | DEV stress labels only; ensure no “思维宇宙” product copy |
| `src/components/shell/LocusPeek.tsx` | copy only if needed |
| `src/components/card/Composer.tsx` | if “Local · demo” permanent — soften to source-aware (no ChatPort) |
| `README.md` (root) | one line: philosophy waves pointer |

**Forbidden:** DB, edges, chat, obsidian write, skills implementation, CSS redesign.

## 2. Tasks

1. Write `live-attention.md` (short)
2. Grep UI for 宇宙/记忆/技能/沉淀/收藏 misuse; fix remaining shell strings not owned by D
3. MapStage: comment or label that overview is tree projection
4. Commit: `docs(shell): (plan-f) naming fence + live attention`

## 3. Acceptance

- [ ] Doc exists and linked
- [ ] No left-rail primary nav labeled bare「宇宙」「记忆」「技能市场」
- [ ] `npm run build` still works (string-only)

## 4. Diff Report

`"plan":"F"`
