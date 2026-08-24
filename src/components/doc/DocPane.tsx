import { useCallback, useEffect, useRef, useState } from "react";
import { formatDocAnchorQuote } from "../../lib/composerPayload";
import { getExplainCached } from "../../lib/explainCache";
import { explainSpan } from "../../state/explainActions";
import { useWorkspace } from "../../state/workspaceStore";
import type { SourceSpan } from "../../types";
import DirectionChooser from "../overlays/DirectionChooser";
import SelectionBar, {
  type SelectionBarState,
} from "../overlays/SelectionBar";
import TermFloat, { type TermFloatState } from "../overlays/TermFloat";
import "../overlays/overlays.css";
import MdTextView from "./MdTextView";
import PdfView from "./PdfView";
import "./doc.css";

function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text);
  }
}

function dispatchComposerQuote(quote: string) {
  window.dispatchEvent(
    new CustomEvent("soit:set-composer-quote", { detail: { quote } }),
  );
}

/**
 * Read-only doc companion chrome + body (PEL-156).
 * Owns selection → SelectionBar / quote / spawn (D5); does not share card sel state.
 * When opened from materials, `onBackToList` returns to the **same** companion slot.
 */
export default function DocPane({
  onBackToList,
}: {
  onBackToList?: () => void;
} = {}) {
  const docSession = useWorkspace((s) => s.docSession);
  const closeDoc = useWorkspace((s) => s.closeDoc);
  const closeMaterialsRail = useWorkspace((s) => s.closeMaterialsRail);
  const retryDoc = useWorkspace((s) => s.retryDoc);
  const confirmDocClosed = useWorkspace((s) => s.confirmDocClosed);
  const focusId = useWorkspace((s) => s.focusId);
  const turnsByCardId = useWorkspace((s) => s.turnsByCardId);
  const spawnInquiry = useWorkspace((s) => s.spawnInquiry);

  const { status, ref, layout, textContent, error, requestPath, cursor } =
    docSession;
  const isPeek = layout === "peek";

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const floatSeqRef = useRef(0);
  const [selBar, setSelBar] = useState<SelectionBarState | null>(null);
  const [chooser, setChooser] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const [float, setFloat] = useState<TermFloatState | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const focusTurns = focusId ? (turnsByCardId[focusId] ?? []) : [];
  const canSpawn = focusTurns.length > 0;
  const lastTurnId = focusTurns[focusTurns.length - 1]?.id ?? "";

  // Finish close anim → closed (FSM closing → closed).
  useEffect(() => {
    if (status !== "closing") return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const ms = reduced ? 40 : 180;
    const t = window.setTimeout(() => {
      confirmDocClosed();
    }, ms);
    return () => window.clearTimeout(t);
  }, [status, confirmDocClosed]);

  // Drop selection chrome when doc leaves ready body.
  useEffect(() => {
    if (status === "ready") return;
    floatSeqRef.current += 1;
    setSelBar(null);
    setChooser(null);
    setFloat(null);
  }, [status, ref?.pathRel]);

  // Optional page cursor restore (PDF P1; kept for return-to-source clue).
  useEffect(() => {
    if (status !== "ready" || cursor.page == null) return;
    const el = bodyRef.current;
    if (!el) return;
    el.dataset.docPage = String(cursor.page);
  }, [status, cursor.page]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  // PEL-163: keep TermFloat until close button; outside click only clears sel/chooser.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (
        t.closest(".ic-float") ||
        t.closest(".ic-selbar") ||
        t.closest(".ic-chooser") ||
        t.closest(".doc-pane__body")
      ) {
        return;
      }
      setSelBar(null);
      setChooser(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const displayTerm = useCallback((span: string) => {
    const t = span.trim();
    if (t.length <= 24) return t;
    return `${t.slice(0, 24)}…`;
  }, []);

  const focusComposer = useCallback(() => {
    const el = document.querySelector<HTMLTextAreaElement>(".ic-dock textarea");
    el?.focus();
  }, []);

  const buildDocSource = useCallback(
    (text: string): SourceSpan => ({
      turnId: lastTurnId,
      text,
      docPath: ref?.pathRel,
      docKind: ref?.kind,
      docPage: cursor.page,
    }),
    [lastTurnId, ref?.pathRel, ref?.kind, cursor.page],
  );

  const runSpawn = useCallback(
    (kind: "deepen" | "diverge", text: string) => {
      if (!canSpawn) {
        setToast("先在卡内有一轮对话");
        return;
      }
      const source = buildDocSource(text.trim());
      if (!source.text) return;
      void spawnInquiry({ kind, source, actor: "user" }).then((id) => {
        if (!id) {
          setToast(kind === "deepen" ? "深挖失败，请重试" : "发散失败，请重试");
        }
      });
      floatSeqRef.current += 1;
      setFloat(null);
      setSelBar(null);
      setChooser(null);
    },
    [canSpawn, buildDocSource, spawnInquiry],
  );

  const runExplain = useCallback(
    async (span: string, seq: number, opts?: { skipCache?: boolean }) => {
      if (!focusId) {
        if (floatSeqRef.current !== seq) return;
        setFloat((prev) =>
          prev
            ? {
                ...prev,
                body: "",
                status: "error",
                error: "需要焦点探究卡才能解释",
              }
            : null,
        );
        return;
      }
      try {
        const text = await explainSpan({
          cardId: focusId,
          span,
          skipCache: opts?.skipCache,
        });
        if (floatSeqRef.current !== seq) return;
        setFloat((prev) =>
          prev
            ? {
                ...prev,
                body: text,
                status: "ready",
                error: undefined,
              }
            : null,
        );
      } catch (err) {
        if (floatSeqRef.current !== seq) return;
        const message =
          err instanceof Error && err.message
            ? err.message
            : "解释失败，请重试";
        setFloat((prev) =>
          prev
            ? {
                ...prev,
                body: "",
                status: "error",
                error: message,
              }
            : null,
        );
      }
    },
    [focusId],
  );

  const onFloatMove = useCallback((x: number, y: number) => {
    setFloat((prev) => (prev ? { ...prev, x, y } : null));
  }, []);

  const onBodyMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (status !== "ready" || !ref) return;
      if (ref.kind !== "md" && ref.kind !== "text") return;

      const t = e.target;
      if (t instanceof Element && t.closest(".ic-selbar")) return;

      const sel = window.getSelection();
      const text = sel ? String(sel.toString() || "").trim() : "";
      if (!text || text.length < 2) {
        setSelBar(null);
        return;
      }
      const anchor = sel?.anchorNode;
      const el =
        anchor instanceof Element ? anchor : (anchor?.parentElement ?? null);
      if (!el?.closest(".doc-pane__body")) {
        setSelBar(null);
        return;
      }
      const range = sel!.rangeCount ? sel!.getRangeAt(0) : null;
      const rect = range?.getBoundingClientRect();
      const x = rect ? rect.left + rect.width / 2 : e.clientX;
      const y = rect ? rect.top - 8 : e.clientY;
      floatSeqRef.current += 1;
      setFloat(null);
      setChooser(null);
      setSelBar({ text, x, y: Math.max(8, y - 40) });
    },
    [status, ref],
  );

  const onSelectionExplain = useCallback(() => {
    if (!selBar) return;
    const span = selBar.text;
    const x = selBar.x;
    const y = selBar.y;
    setSelBar(null);
    setChooser(null);
    const seq = ++floatSeqRef.current;
    const cached = focusId ? getExplainCached(focusId, span) : null;
    setFloat({
      term: displayTerm(span),
      span,
      body: cached ?? "",
      status: cached ? "ready" : "loading",
      x: x + 12,
      y: y + 12,
      source: "selection",
      turnId: lastTurnId || undefined,
    });
    if (!cached) void runExplain(span, seq);
  }, [selBar, displayTerm, lastTurnId, runExplain, focusId]);

  const onFloatRetry = useCallback(() => {
    if (!float) return;
    const seq = ++floatSeqRef.current;
    setFloat((prev) =>
      prev
        ? {
            ...prev,
            body: "",
            status: "loading",
            error: undefined,
          }
        : null,
    );
    void runExplain(float.span, seq, { skipCache: true });
  }, [float, runExplain]);

  const closeFloat = useCallback(() => {
    floatSeqRef.current += 1;
    setFloat(null);
  }, []);

  const quoteSelection = useCallback(
    (text: string) => {
      if (!ref) return;
      const q = formatDocAnchorQuote({
        path: ref.pathRel,
        text,
        page: cursor.page,
      });
      dispatchComposerQuote(q);
      focusComposer();
    },
    [ref, cursor.page, focusComposer],
  );

  const title =
    ref?.displayName ??
    (requestPath
      ? requestPath.replace(/\\/g, "/").split("/").filter(Boolean).pop()
      : null) ??
    "文档";

  const pathHint = ref?.pathRel ?? requestPath ?? "";

  return (
    <aside
      className={`doc-pane${isPeek ? " is-peek" : ""}${status === "closing" ? " is-closing" : ""}`}
      aria-label="文档陪读"
      data-status={status}
    >
      <header className="doc-pane__chrome">
        <div className="doc-pane__title">
          <span>{title}</span>
          {pathHint ? (
            <span className="doc-pane__path" title={pathHint}>
              {pathHint}
            </span>
          ) : null}
        </div>
        <div className="doc-pane__actions">
          {onBackToList ? (
            <button
              type="button"
              className="doc-pane__btn"
              data-tip="返回资料列表"
              aria-label="返回资料列表"
              onClick={onBackToList}
            >
              列表
            </button>
          ) : null}
          <button
            type="button"
            className="doc-pane__btn is-close"
            aria-label="关闭文档"
            data-tip="关闭"
            onClick={() => {
              // Materials-owned companion: close whole surface; else doc only.
              if (onBackToList) closeMaterialsRail();
              else closeDoc();
            }}
          >
            ×
          </button>
        </div>
      </header>

      <div
        className="doc-pane__body"
        ref={bodyRef}
        onMouseUp={onBodyMouseUp}
      >
        {status === "loading" ? (
          <div className="doc-pane__status" role="status">
            正在打开文档…
          </div>
        ) : null}

        {status === "error" ? (
          <div className="doc-pane__status is-error" role="alert">
            <span>{error ?? "无法打开文档"}</span>
            <div className="doc-pane__status-actions">
              <button
                type="button"
                className="doc-pane__primary"
                onClick={() => void retryDoc()}
              >
                重试
              </button>
              <button
                type="button"
                className="doc-pane__primary"
                onClick={() => closeDoc()}
              >
                关闭
              </button>
            </div>
          </div>
        ) : null}

        {(status === "ready" || status === "closing") && ref ? (
          ref.kind === "md" || ref.kind === "text" ? (
            <MdTextView
              kind={ref.kind}
              text={textContent ?? ""}
              pathHint={ref.pathRel}
            />
          ) : (
            <PdfView docRef={ref} />
          )
        ) : null}
      </div>

      {toast ? (
        <p className="doc-pane__toast" role="status">
          {toast}
        </p>
      ) : null}

      {float ? (
        <TermFloat
          float={float}
          onClose={closeFloat}
          onRetry={onFloatRetry}
          onDeepen={() => runSpawn("deepen", float.span)}
          onDiverge={() => runSpawn("diverge", float.span)}
          onQuote={() => {
            quoteSelection(float.span);
            closeFloat();
          }}
          onMove={onFloatMove}
        />
      ) : null}

      {selBar ? (
        <SelectionBar
          bar={selBar}
          onExplain={onSelectionExplain}
          onPreview={() => {
            if (!canSpawn) {
              setToast("先在卡内有一轮对话");
            }
            setChooser({
              x: selBar.x + 52,
              y: selBar.y,
              text: selBar.text,
            });
          }}
          onQuote={() => {
            quoteSelection(selBar.text);
            setSelBar(null);
            setChooser(null);
          }}
          onCopy={() => {
            copyText(selBar.text);
            setSelBar(null);
            setChooser(null);
          }}
        />
      ) : null}

      {chooser ? (
        <DirectionChooser
          x={chooser.x}
          y={chooser.y}
          sourceLabel={chooser.text}
          disabled={!canSpawn}
          onDeepen={(label) => {
            setSelBar(null);
            setChooser(null);
            runSpawn("deepen", label);
          }}
          onDiverge={(label) => {
            setSelBar(null);
            setChooser(null);
            runSpawn("diverge", label);
          }}
        />
      ) : null}
    </aside>
  );
}
