# src/components/card/ — inquiry card

One card = one **inquiry** (not a note page, not a flashcard). Center column content.

Parent: `src/AGENTS.md`. Interaction reference: `知识库/docs/explore-card-interaction.md` (borrow patterns, not Explore product rules).
Stage chrome: `知识库/docs/card-stage-chrome.md` (专注模式 · **drag-to-switch** · motion).

**Agent dual-track** (spec v1.1): card stays Inquiry home; Composer gains stop/export/import/handoff affordances without making External Runtime a third fork kind. Contract: `docs/superpowers/specs/2026-08-20-agent-dual-track-spec.md`.

## Pieces

| File | Role |
|------|------|
| `InquiryCard.tsx` | Focused card; 专注模式; peel-drag switch; path sheets |
| `CardHeader.tsx` | Title / path / tools / 专注模式; drag surface on titles |
| `TurnItem.tsx` | One turn; collapse; hover affordances |
| `TurnHistoryRail.tsx` | External right-edge multi-turn history dock (PEL-148) |
| `LineSidebar.tsx` | React Bits proximity sidebar used by the history dock |
| `EdgeActions.tsx` | Card-edge **深挖 / 发散** only |
| `Composer.tsx` | Outside-card composer; **停止** while inflight/runtime; send disabled when busy |
| `CardAgentMenu.tsx` | 导出任务单 / 粘贴导入 / 交给本地 Agent (handoff confirm) |
| `icons.tsx` / `card.css` | Icons + motion/layout for the card column |

## Rules

- Edge long-card actions are **exactly two:** deepen and diverge. No third edge type for regenerate.
- Composer: **Enter = newline**, **Ctrl+Enter = send** (match established UX).
- Turn ops (`regenerateTurn`, `deleteTurn`, collapse) stay **on the current card**; regenerate must not spawn nodes.
- Assistant HTML is a **safe subset** from `renderAssistantHtml` (escape → structure → marks); may include marks (`class="mark" data-term=...`). Never trust model raw HTML.
- Mark / selection short-explain goes through **`explainSpan` only** (never `port.explain` / fetch from UI). Explain does **not** create cards, turns, or db rows; spawn still requires explicit deepen/diverge — do not silent-deepen.
- Wire mutations through `useWorkspace`, not local fake graphs.
- **Turn history** docks **outside** the card, flush on the right border (hover edge strip → Line Sidebar). Must not squeeze card width. Wheel scrolls the list. Not the workspace graph.
- **Drag on header titles** switches related cards (up=parent, down=child, L/R=sibling). Not free reposition on the stage.
- Under-sheets show ancestor titles; click → `focusNode` back.
- **Dual-track UI:** generating → Composer primary becomes **停止** (`cancelInflight` or `cancelRuntimeHandoff`); `CardAgentMenu` for **导出任务单** / **粘贴导入** / handoff; disable send while `inquiryInflight` or runtime run active — spec §2.1 / §2.4 / §2.6 / §2.7.

## Do not

- Auto-pause parent when diverging.
- Treat “重来” as a new tree node.
- Pull Explore’s three-way fork model.
- Free-floating multi-composer mini windows (MindScape).
