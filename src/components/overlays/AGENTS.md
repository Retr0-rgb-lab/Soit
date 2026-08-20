# src/components/overlays/ — floating UI

Transient UI above the card: marks, direction choice, selection, tooltips.

Parent: `src/AGENTS.md`. Card mark flow: `知识库/docs/对象模型.md` (下划线手势).

## Pieces

| File | Role |
|------|------|
| `TermFloat.tsx` | Mark/selection short-explain float: loading / ready / error+retry; deepen / diverge / quote / close |
| `DirectionChooser.tsx` | Explicit **深挖 vs 发散** before spawn |
| `SelectionBar.tsx` | Free-text selection: **解释** / preview direction / quote / copy |
| `TooltipLayer.tsx` | Shared tooltips |
| `overlays.css` | Pop-in / fade; honor reduced motion |

## Rules

- Short explain is optional and **does not** create a card or write db/turns. Parent (`InquiryCard`) calls **`explainSpan`**; overlays stay presentational (status/body/actions only).
- Clicking a mark or choosing 解释 opens TermFloat; **spawn still requires** explicit deepen/diverge — never silent default-deepen.
- Spawn goes through store `spawnDeepen` / `spawnDiverge` with full **`span`** text as `sourceLabel` / SourceSpan (not a truncated UI title).
- Keep overlays presentational + thin event wiring; ranking/layout math stays in `lib/`.

## Do not

- Implement full card chrome or left-rail lists here.
- Add network, host, or `port.explain` / `fetch` calls from overlay components — explain stays in card/state via `explainSpan`.
