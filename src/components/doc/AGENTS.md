# src/components/doc/ — document companion pane

Read-only vault doc surface beside the inquiry card (PEL-156). Not an editor, not a third node kind, not CardPip.

Parent: `src/AGENTS.md`. Spec: `docs/superpowers/specs/2026-08-20-doc-companion-viewer-spec.md`.

## Pieces

| File | Role |
|------|------|
| `DocPane.tsx` | Chrome: title, close, split/doc-wide layout, loading/error/retry; body host |
| `MdTextView.tsx` | md/text body; text=`<pre>`; md=escaped lightweight subset (**no** `wrapMarks`) |
| `PdfGuide.tsx` | pdf/unsupported guide — path, size, copy; **no** iframe/base64 |
| `OpenDocPopover.tsx` | Path input + recent 5 (`soit-doc-recent`); submit → `openDoc` |
| `doc.css` | Tokens only (`--bg-panel` / `--ink` / …); no hard-coded cream/white fills |

## Rules

- Session state lives in `workspaceStore.docSession` (`openDoc` / `closeDoc` / `setDocLayout` / `retryDoc`).
- AppShell owns the center-stage matrix; **never** mount Doc with Orbit (map force-closes session).
- Open entry: Composer tool + command palette → `soit:open-doc` → `OpenDocPopover`. No `window.prompt`; no `<input type="file">` as main path.
- P0 pdf = guide only. Embedded pdfjs is out of scope here.
- **Selection (D5):** DocPane owns selBar/chooser/float; reuse `SelectionBar` / `DirectionChooser` / `TermFloat`. Quote → `formatDocAnchorQuote` → `soit:set-composer-quote` (InquiryCard sets composer chip). Spawn via **`spawnInquiry` full text** + `docPath`/`docKind`/`docPage?`; disable deepen/diverge when focus card has no turns (toast「先在卡内有一轮对话」).

## Do not

- Edit or write back vault files.
- `data:` / `blob:` PDF iframe.
- Hard-code `#fff` / cream panel fills (breaks 墨夜).
- Persist DocSession into universe.db.
