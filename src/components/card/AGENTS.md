# src/components/card/ — inquiry card

One card = one **inquiry** (not a note page, not a flashcard). Center column content.

Parent: `src/AGENTS.md`. Interaction reference: `知识库/docs/explore-card-interaction.md` (borrow patterns, not Explore product rules).
Stage chrome: `知识库/docs/card-stage-chrome.md` (专注模式 · **drag-to-switch** · motion).

**Agent dual-track** (spec v1.1): card stays Inquiry home. External runtime / vault 整理 **不**在主卡页挂按钮（用户自有 coding agent）；store/API 可保留。Contract: `docs/superpowers/specs/2026-08-20-agent-dual-track-spec.md`.

## Pieces

| File | Role |
|------|------|
| `InquiryCard.tsx` | Focused card; 专注模式; peel-drag switch; path sheets |
| `CardHeader.tsx` | Title / path / tools / 专注模式; drag surface on titles |
| `HoverIconTray.tsx` | Top-right hover tray — icons slide out (Reicon + CSS) |
| `icons.tsx` | Stroke locals + Reicon wrappers (`reicon-react`) |
| `TurnItem.tsx` | One turn; collapse; hover affordances; **process strip** (think + tools, single expand entry) |
| `TurnHistoryRail.tsx` | External right-edge multi-turn history dock (PEL-148) |
| `LineSidebar.tsx` | React Bits proximity sidebar used by the history dock |
| `EdgeActions.tsx` | Card-edge **深挖 / 发散** only |
| `Composer.tsx` | Outside-card composer; **附件** + **@ 引用卡片**; **停止** while inquiry inflight |
| `icons.tsx` / `card.css` | Icons + motion/layout for the card column |

## Rules

- Edge long-card actions are **exactly two:** deepen and diverge. No third edge type for regenerate.
- Composer: **Enter = send**, **Shift+Enter = newline**; **@** or toolbar opens card mention picker; attach button adds local files (text inlined into user turn, binary name-only).
- Turn ops (`regenerateTurn`, `deleteTurn`, collapse) stay **on the current card**; regenerate must not spawn nodes.
- **Delete inquiry** (`deleteInquiry`): HoverIconTray trash → confirm → cascade subtree (turns + edges). Not EdgeActions. No Obsidian cascade. Universe → Host `delete_inquiry`.
- Assistant HTML is a **safe subset** from `renderAssistantHtml` (escape → structure → marks); may include marks (`class="mark" data-term=...`). Never trust model raw HTML.
- **Process / think strip** (PEL-160/173): single fold under the turn; sits on **card paper** — no nested panel fills, no mono terminal type; same `--font` as body, softer ink + left rule only.
- Mark / selection short-explain goes through **`explainSpan` only** (never `port.explain` / fetch from UI). Explain does **not** create cards, turns, or db rows; spawn still requires explicit deepen/diverge — do not silent-deepen.
- Wire mutations through `useWorkspace`, not local fake graphs.
- **Turn history** sits **in-flow on the right** (hover edge strip → Line Sidebar). Open rail **shrinks card width** so the panel stays on-screen. Wheel scrolls the list. Not the workspace graph.
- Header icon tray: expanded state **hides** the ⋯ / 卡片工具 trigger.
- **Drag on header titles** (`useCardPip` + `CardPipWindow`): **flick** → switch card; **hold ~0.45s** → larger YouTube-like **PiP** at drag locus (portal, clamped, drag/expand/close). FSM: `知识库/docs/card-pip-fsm.md`.
- **Scroll chrome fade** (Explore-like): header is **absolute overlay**; body uses `--ic-head-pad` so content scrolls *into* the top band as title fades (`scrollChromeFade`). Not opacity-only dead space.
- Under-sheets show ancestor titles; click → `focusNode` back.
- Generating → Composer primary becomes **停止** (`cancelInflight`); disable send while `inquiryInflight`. Do **not** surface export-brief / import / handoff chrome on the main card.

## Do not

- Auto-pause parent when diverging.
- Treat “重来” as a new tree node.
- Pull Explore’s three-way fork model.
- Free-floating multi-composer mini windows (MindScape).
- Main-card toolbars for 导出任务单 / 粘贴导入 / 交给本地 Agent / 写入概念 / 记下残渣（vault 整理交给用户自己的 agent）。
