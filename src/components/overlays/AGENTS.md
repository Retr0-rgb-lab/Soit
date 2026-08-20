# src/components/overlays/ — floating UI

Transient UI above the card: marks, direction choice, selection, tooltips.

Parent: `src/AGENTS.md`. Card mark flow: `知识库/docs/对象模型.md` (下划线手势).

## Pieces

| File | Role |
|------|------|
| `TermFloat.tsx` | Hover/click chrome on marked terms |
| `DirectionChooser.tsx` | Explicit **深挖 vs 发散** before spawn |
| `SelectionBar.tsx` | Free-text selection: preview direction / quote / copy |
| `TooltipLayer.tsx` | Shared tooltips |
| `overlays.css` | Pop-in / fade; honor reduced motion |

## Rules

- Clicking a mark **must** offer direction choice (or equivalent explicit step) before creating/focusing a child — never silent default-deepen.
- Spawn goes through store `spawnDeepen` / `spawnDiverge` with a clear `sourceLabel` from the span/selection.
- Keep overlays presentational + thin event wiring; ranking/layout math stays in `lib/`.

## Do not

- Implement full card chrome or left-rail lists here.
- Add network or host calls from overlay components.
