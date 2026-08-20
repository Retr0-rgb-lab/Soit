# 知识库/docs/ — decided consensus

Only **拍板** product/architecture truth. Research scraps and delivery plans do not live here.

Parent: `知识库/AGENTS.md`.

## Canon

| File | Use when |
|------|----------|
| `共识.md` | Identity, two-layer memory, fork rules, skills, v1 closed loop, doc companion (§2.1) |
| `对象模型.md` | Card / edge / vault / universe / DocRef·DocSession / context-inheritance invariants |
| `非目标.md` | What not to build; failed paths not to reopen |
| `doc-session-fsm.md` | Read-only doc companion session FSM (PEL-156) |
| `card-stage-chrome.md` / `card-pip-fsm.md` | Focus stage, drag/PiP; doc pane coupling (not CardPip) |
| `explore-*.md` / `map-scale-lod.md` / `card-motion-locus.md` | UX research borrowed into Soit rules — patterns, not a mandate to clone Explore |

## Rules

- Change a decided rule → update the doc **in the same change set** as code (or first).
- Prefer linking these paths from PRs/commits over restating long product essays in code comments.
- English UI strings are fine in app code; product vocabulary (探究, 深挖, 发散, 宇宙, vault) should stay consistent with these docs.
