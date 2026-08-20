# src/components/card/ — inquiry card

One card = one **inquiry** (not a note page, not a flashcard). Center column content.

Parent: `src/AGENTS.md`. Interaction reference: `知识库/docs/explore-card-interaction.md` (borrow patterns, not Explore product rules).

## Pieces

| File | Role |
|------|------|
| `InquiryCard.tsx` | Focused card composition |
| `CardHeader.tsx` | Title / path / header actions |
| `TurnItem.tsx` | One turn; collapse; hover affordances |
| `TurnHistoryRail.tsx` | External right-edge multi-turn history dock (PEL-148) |
| `LineSidebar.tsx` | React Bits proximity sidebar used by the history dock |
| `EdgeActions.tsx` | Card-edge **深挖 / 发散** only |
| `Composer.tsx` | Outside-card composer |
| `icons.tsx` / `card.css` | Icons + motion/layout for the card column |

## Rules

- Edge long-card actions are **exactly two:** deepen and diverge. No third edge type for regenerate.
- Composer: **Enter = newline**, **Ctrl+Enter = send** (match established UX).
- Turn ops (`regenerateTurn`, `deleteTurn`, collapse) stay **on the current card**; regenerate must not spawn nodes.
- Assistant HTML may include marks (`class="mark" data-term=...`); click handling opens overlays — do not silent-deepen.
- Wire mutations through `useWorkspace`, not local fake graphs.
- **Turn history** docks **outside** the card, flush on the right border (hover edge strip → Line Sidebar). Must not squeeze card width. Wheel scrolls the list. Not the workspace graph.

## Do not

- Auto-pause parent when diverging.
- Treat “重来” as a new tree node.
- Pull Explore’s three-way fork model.
