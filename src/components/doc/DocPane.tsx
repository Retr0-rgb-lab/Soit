import { useCallback, useEffect } from "react";
import { useWorkspace } from "../../state/workspaceStore";
import MdTextView from "./MdTextView";
import PdfGuide from "./PdfGuide";
import "./doc.css";

/**
 * Read-only doc companion chrome + body (PEL-156 D4).
 * Selection / spawn wiring lands in D5.
 */
export default function DocPane() {
  const docSession = useWorkspace((s) => s.docSession);
  const closeDoc = useWorkspace((s) => s.closeDoc);
  const setDocLayout = useWorkspace((s) => s.setDocLayout);
  const retryDoc = useWorkspace((s) => s.retryDoc);
  const confirmDocClosed = useWorkspace((s) => s.confirmDocClosed);

  const { status, ref, layout, textContent, error, requestPath } = docSession;
  const isPeek = layout === "peek";

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

  const onToggleLayout = useCallback(() => {
    if (status !== "ready") return;
    if (layout === "doc-wide") setDocLayout("split");
    else setDocLayout("doc-wide");
  }, [status, layout, setDocLayout]);

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
          {!isPeek ? (
            <button
              type="button"
              className={`doc-pane__btn${layout === "doc-wide" ? " is-on" : ""}`}
              data-tip={layout === "doc-wide" ? "恢复分栏" : "加宽文档"}
              aria-label={layout === "doc-wide" ? "恢复分栏" : "加宽文档"}
              disabled={status !== "ready"}
              onClick={onToggleLayout}
            >
              {layout === "doc-wide" ? "分栏" : "加宽"}
            </button>
          ) : null}
          <button
            type="button"
            className="doc-pane__btn is-close"
            aria-label="关闭文档"
            data-tip="关闭文档"
            onClick={() => closeDoc()}
          >
            ×
          </button>
        </div>
      </header>

      <div className="doc-pane__body">
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
            <MdTextView kind={ref.kind} text={textContent ?? ""} />
          ) : (
            <PdfGuide docRef={ref} />
          )
        ) : null}
      </div>
    </aside>
  );
}
