# Soit brand marks

**Current system: Offset Ledger (v2)** — stacked inquiry sheets + solid asymmetric fork (deepen heavy / diverge light). No flowchart dots.

Palette matches `src/styles/tokens.css`.

## Concept

| Layer | Meaning |
|-------|---------|
| Stacked sheets | Sessions / inquiry pile you host |
| Vertical bar | 深挖 deepen |
| Right branch | 发散 diverge (lighter mass) |
| Ink plate (app) | Local host / desk blotter |

Retired: Forked Card v1 (equal Y + three dots) — too generic.

## Files

| File | Use |
|------|-----|
| `soit-icon-app.svg` | Primary app icon (ink plate + stack) |
| `soit-mark.svg` | UI mark (no plate) — left rail |
| `soit-wordmark.svg` | Mark + Soit |
| `v2/` | Full direction board + alternates (Spine S, Blotter Seal) |
| `v2/preview.html` | Side-by-side comparison |

## Wired into the app

| Surface | Source |
|---------|--------|
| Desktop / installer | `src-tauri/icons/*` via `npx tauri icon brand/soit-icon-app.svg` |
| Browser favicon | `public/favicon.svg`, `public/favicon.ico` |
| Left rail | `public/soit-mark.svg` |

Regenerate after mark edits:

```bash
npx tauri icon brand/soit-icon-app.svg -o src-tauri/icons
Copy-Item src-tauri/icons/icon.ico public/favicon.ico
Copy-Item brand/soit-icon-app.svg public/favicon.svg
Copy-Item brand/soit-mark.svg public/soit-mark.svg
```
