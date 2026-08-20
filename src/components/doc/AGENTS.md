# src/components/doc/ — document companion pane

Read-only vault doc surface beside the inquiry card (PEL-156). Not an editor, not a third node kind, not CardPip.

Parent: `src/AGENTS.md`. Spec SSoT: `docs/superpowers/specs/2026-08-20-doc-companion-viewer-spec.md` v1.1  
(stub only under `知识库/specs/`). Shell mount matrix: `components/shell/AGENTS.md`.

## Pieces

| File | Role |
|------|------|
| `DocPane.tsx` | Chrome: title, close, split/doc-wide/peek layout, loading/error/retry; body host; owns selection UI state |
| `MdTextView.tsx` | md/text body; text=`<pre>`; md=escaped lightweight subset (**no** `wrapMarks`) |
| `PdfGuide.tsx` | pdf/unsupported guide — path, size, copy; **no** iframe/base64 |
| `OpenDocPopover.tsx` | Path input + recent 5 (`soit-doc-recent`); submit → `openDoc`; unbound → guide to 设置·空间 |
| `doc.css` | Tokens only (`--bg-panel` / `--ink` / …); no hard-coded cream/white fills |

## Rules

- Session state lives in `workspaceStore.docSession` (`openDoc` / `closeDoc` / `setDocLayout` / `retryDoc`). Pure FSM: `lib/docSession.ts`.
- AppShell owns the center-stage matrix; **never** mount Doc with Orbit (map / `loadSnapshot` → store `force_close`).
- Open entry: Composer tool + command palette → `soit:open-doc` → `OpenDocPopover`. No `window.prompt`; no `<input type="file">` as main path. Mock path: `demo/welcome.md`.
- P0 pdf = guide only. Embedded pdfjs is out of scope here.
- **Selection:** DocPane owns selBar/chooser/float; reuse `SelectionBar` / `DirectionChooser` / `TermFloat`. Quote → `formatDocAnchorQuote` → `soit:set-composer-quote` (InquiryCard sets composer chip). Spawn via **`spawnInquiry` full text** + `docPath`/`docKind`/`docPage?`; disable deepen/diverge when focus card has no turns (toast「先在卡内有一轮对话」).
- **Return-to-source:** when edge `SourceSpan.docPath` set, focus parent then `openDoc(docPath)` (+ page clue); else existing turn highlight.

## Do not

- Edit or write back vault files.
- `data:` / `blob:` PDF iframe.
- Hard-code `#fff` / cream panel fills (breaks 墨夜).
- Persist DocSession into universe.db.
- Share reducer/state with CardPip.
