import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { chromeFadeStyle } from "../../lib/scrollChromeFade";
import {
  collapseCrumbs,
  ELLIPSIS_CRUMB_ID,
} from "../../lib/treeNav";
import type { InquiryNode } from "../../types";

interface Crumb {
  id: string;
  title: string;
}

interface Props {
  crumbs: Crumb[];
  title: string;
  /** Inquiry status — read-only chip when present. */
  status?: string | null;
  /** Guiding question — read-only under title when present. */
  question?: string | null;
  onCrumb: (id: string) => void;
  /** Source chip: return to parent and highlight source span. */
  onReturnToSource?: () => void;
  /**
   * PEL-150 — peel-drag on title surface to switch cards.
   * Does not free-move the card on the stage.
   */
  onDragSurfacePointerDown?: (e: ReactPointerEvent) => void;
  onDragSurfacePointerMove?: (e: ReactPointerEvent) => void;
  onDragSurfacePointerUp?: (e: ReactPointerEvent) => void;
  onDragSurfacePointerCancel?: (e: ReactPointerEvent) => void;
  parent?: InquiryNode | null;
  /**
   * Explore-like: 0 = full chrome, 1 = title faded after scroll down.
   */
  chromeFade?: number;
  /** Rename mode — renders an inline title input instead of <h1>. */
  renaming?: boolean;
  /** Commit a new title (trimmed; caller decides persistence). */
  onRename?: (title: string) => void;
  /** Exit rename mode after commit/cancel. */
  onRenamingChange?: (renaming: boolean) => void;
}

const CardHeader = forwardRef<HTMLDivElement, Props>(function CardHeader(
  {
    crumbs,
    title,
    status,
    question,
    onCrumb,
    onReturnToSource,
    onDragSurfacePointerDown,
    onDragSurfacePointerMove,
    onDragSurfacePointerUp,
    onDragSurfacePointerCancel,
    parent,
    chromeFade = 0,
    renaming = false,
    onRename,
    onRenamingChange,
  },
  ref,
) {
  const [crumbsExpanded, setCrumbsExpanded] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    if (!renaming) return;
    setTitleDraft(title);
    committedRef.current = false;
    // Focus + select after paint. `autoFocus` can mis-fire in WebView2 and
    // blur immediately (closing the input before the user sees it).
    const raf = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [renaming, title]);

  const commitRename = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const next = titleDraft.trim();
    if (next && next !== title) onRename?.(next);
    onRenamingChange?.(false);
  };

  const cancelRename = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onRenamingChange?.(false);
  };

  const visible = useMemo(() => {
    if (crumbsExpanded) return crumbs;
    return collapseCrumbs(crumbs);
  }, [crumbs, crumbsExpanded]);

  const dragEnabled = Boolean(onDragSurfacePointerDown) && !renaming;
  const fade = chromeFadeStyle(chromeFade);
  const fadeStyle = fade as CSSProperties;

  const faded = chromeFade > 0.92;

  return (
    <div
      ref={ref}
      className={`ic-head${chromeFade > 0.02 ? " is-scrolled" : ""}${faded ? " is-faded" : ""}`}
      data-chrome-fade={chromeFade.toFixed(3)}
      aria-hidden={faded || undefined}
    >
      <div
        className="ic-head-fade"
        style={{
          ...fadeStyle,
          /* When fully faded, never block scroll/clicks in the top band */
          pointerEvents: faded ? "none" : fade.pointerEvents,
        }}
      >
        <div
          className={`titles${dragEnabled ? " ic-drag-surface" : ""}`}
          onPointerDown={dragEnabled ? onDragSurfacePointerDown : undefined}
          onPointerMove={dragEnabled ? onDragSurfacePointerMove : undefined}
          onPointerUp={dragEnabled ? onDragSurfacePointerUp : undefined}
          onPointerCancel={dragEnabled ? onDragSurfacePointerCancel : undefined}
          title={
            dragEnabled
              ? "拖标题：甩开切换 · 按住片刻在拖动处打开小窗"
              : undefined
          }
        >
          <nav className="ic-crumbs" aria-label="探究路径">
            {visible.length === 0 ? (
              <span className="ic-crumb muted">Soit</span>
            ) : (
              visible.map((c, i) => {
                const last = i === visible.length - 1;
                return (
                  <span key={`${c.id}-${i}`} className="ic-crumb-wrap">
                    {i > 0 && (
                      <span className="ic-crumb-sep" aria-hidden>
                        /
                      </span>
                    )}
                    {c.id === ELLIPSIS_CRUMB_ID ? (
                      <button
                        type="button"
                        className="ic-crumb link"
                        aria-label="展开完整路径"
                        onClick={() => setCrumbsExpanded(true)}
                      >
                        …
                      </button>
                    ) : last ? (
                      <span className="ic-crumb current" aria-current="page">
                        {c.title}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="ic-crumb link"
                        onClick={() => onCrumb(c.id)}
                      >
                        {c.title}
                      </button>
                    )}
                  </span>
                );
              })
            )}
            {crumbsExpanded && crumbs.length > 4 && (
              <button
                type="button"
                className="ic-crumb link"
                style={{ marginLeft: 8 }}
                onClick={() => setCrumbsExpanded(false)}
              >
                收起
              </button>
            )}
          </nav>
          {renaming ? (
            <input
              ref={inputRef}
              className="ic-title-input"
              value={titleDraft}
              aria-label="重命名探究"
              spellCheck={false}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => commitRename()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelRename();
                }
              }}
            />
          ) : (
            <h1>{title}</h1>
          )}
          {(status || question) && (
            <div className="ic-meta">
              {status ? (
                <span className="ic-status" data-status={status}>
                  {status}
                </span>
              ) : null}
              {question ? <p className="ic-question">{question}</p> : null}
            </div>
          )}
          {parent && (
            <p className="ic-source-chip">
              <span className="ic-source-label">来自</span>
              <button
                type="button"
                className="ic-source-link"
                onClick={() =>
                  onReturnToSource ? onReturnToSource() : onCrumb(parent.id)
                }
              >
                {parent.title}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

export default CardHeader;
