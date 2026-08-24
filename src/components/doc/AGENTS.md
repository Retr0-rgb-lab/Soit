# src/components/doc/ — document companion pane

Read-only vault doc surface beside the inquiry card (PEL-156). Not an editor, not a third node kind, not CardPip.

Parent: `src/AGENTS.md`. Spec SSoT: `docs/superpowers/specs/2026-08-20-doc-companion-viewer-spec.md` v1.1  
(stub only under `知识库/specs/`). Shell mount matrix: `components/shell/AGENTS.md`.

## Pieces

| File | Role |
|------|------|
| `DocPane.tsx` | Chrome: title, list back, close; loading/error/retry; body host; owns selection UI state. Width via shell sash only (no 加宽 button) |
| `MdTextView.tsx` | md/text body; text=`<pre>`; md=escaped lightweight subset (**no** `wrapMarks`); pipeline **escape → code put → `protectAndRenderMath` → md subset → restore** (math-katex §2.5); host `.md-text-view` |
| `PdfView.tsx` | pdf embed: iframe → loopback server (PEL-156 P1); loading/error; falls back to `PdfGuide` |
| `PdfGuide.tsx` | pdf/unsupported fallback guide — path, size, copy; shown on browser mock / server failure; **no** iframe/base64 here |
| `OpenDocPopover.tsx` | Path input + recent 5 (`soit-doc-recent`); submit → `openDoc`; unbound → guide to 设置·空间 |
| `doc.css` | Tokens only (`--bg-panel` / `--ink` / …); no hard-coded cream/white fills |

## Rules

- Session state lives in `workspaceStore.docSession` (`openDoc` / `closeDoc` / `setDocLayout` / `retryDoc`). Pure FSM: `lib/docSession.ts`.
- AppShell owns the center-stage matrix; **never** mount Doc with Orbit (map / `loadSnapshot` → store `force_close`).
- Open entry: Composer tool + command palette → `soit:open-doc` → `OpenDocPopover`; MaterialsRail → `selectMaterial` → `openDoc`. No `window.prompt`; no `<input type="file">` as main path (materials import is separate). UI example path: `notes/intro.md`; browser host fixture for tests remains `demo/welcome.md`.
- **Layout / fraction (SPE §2.6):** DocPane does not expose 加宽. Sash drag/double-click live in `components/shell/SplitSash.tsx` (`--doc-fraction` / localStorage).
- **PDF embed (P1):** `PdfView` iframe → `getPdfPreviewUrl` loopback server (127.0.0.1 + per-vault token + sandbox). Native viewer provides read/zoom/search/select-copy. **No PDF selection piping** (quote/explain/deepen stay md/text-only). pdfjs out of scope. `PdfGuide` remains the fallback.
- **Selection:** DocPane owns selBar/chooser/float; reuse `SelectionBar` / `DirectionChooser` / `TermFloat`. Quote → `formatDocAnchorQuote` → `soit:set-composer-quote` (InquiryCard sets composer chip). Spawn via **`spawnInquiry` full text** + `docPath`/`docKind`/`docPage?`; disable deepen/diverge when focus card has no turns (toast「先在卡内有一轮对话」).
- **Return-to-source:** when edge `SourceSpan.docPath` set, focus parent then `openDoc(docPath)` (+ page clue); else existing turn highlight.
- **Math (P0):** `$…$` / `$$…$$` via shared `lib/math/tex.ts` (same PH as code). Styles under `.md-text-view .soit-math*`; `.katex { color: inherit }`. Spec: `docs/superpowers/specs/2026-08-20-math-katex-spec.md`. No CDN KaTeX/fonts.

## Do not

- Edit or write back vault files.
- `data:` / `blob:` PDF iframe.
- Hard-code `#fff` / cream panel fills (breaks 墨夜).
- Persist DocSession into universe.db.
- Share reducer/state with CardPip.
- Load KaTeX/CSS from CDN; invent a second PH namespace for math.
