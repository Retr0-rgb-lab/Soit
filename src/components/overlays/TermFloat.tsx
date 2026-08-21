import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconDeepen,
  IconDiverge,
  IconQuote,
  IconX,
} from "../card/icons";

export type TermFloatStatus = "loading" | "ready" | "error";

export interface TermFloatState {
  /** Display title (mark = term; selection may truncate). */
  term: string;
  /** Full text for explain / spawn SourceSpan / quote — not truncated title. */
  span: string;
  body: string;
  status: TermFloatStatus;
  error?: string;
  x: number;
  y: number;
  source: "mark" | "selection";
  turnId?: string;
  markId?: string;
}

interface Props {
  float: TermFloatState;
  onClose: () => void;
  onRetry: () => void;
  /** Parent already holds float.span for SourceSpan.text. */
  onDeepen: () => void;
  onDiverge: () => void;
  /** Quote full float.span into composer chip. */
  onQuote: () => void;
  /** Persist drag position into parent state (optional). */
  onMove?: (x: number, y: number) => void;
}

const FLOAT_W = 440;
const FLOAT_H = 300;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function clampPos(x: number, y: number): { x: number; y: number } {
  const maxX = Math.max(8, window.innerWidth - FLOAT_W);
  const maxY = Math.max(8, window.innerHeight - FLOAT_H);
  return {
    x: clamp(x, 8, maxX),
    y: clamp(y, 8, maxY),
  };
}

/**
 * Short-explain float (PEL-163):
 * - Draggable by header tab
 * - Closes only via explicit close (parent must not dismiss on outside click)
 * - Body shows only formal explain text (no think chrome)
 */
export default function TermFloat({
  float,
  onClose,
  onRetry,
  onDeepen,
  onDiverge,
  onQuote,
  onMove,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  /** One-shot mount pop-in; cleared after animation so drag end never restarts it. */
  const [enterAnim, setEnterAnim] = useState(true);

  const pos = clampPos(float.x, float.y);

  // Keep on-screen when viewport resizes.
  useEffect(() => {
    const onResize = () => {
      const next = clampPos(float.x, float.y);
      if (next.x !== float.x || next.y !== float.y) {
        onMove?.(next.x, next.y);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [float.x, float.y, onMove]);

  const onHeadPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const t = e.target;
      if (t instanceof Element && t.closest("button")) return;
      e.preventDefault();
      // Drag must not re-trigger enter animation
      setEnterAnim(false);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: float.x,
        origY: float.y,
      };
      setDragging(true);
    },
    [float.x, float.y],
  );

  const onHeadPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      const next = clampPos(
        d.origX + (e.clientX - d.startX),
        d.origY + (e.clientY - d.startY),
      );
      onMove?.(next.x, next.y);
    },
    [onMove],
  );

  const endDrag = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div
      ref={rootRef}
      className={[
        "ic-float",
        enterAnim ? "is-enter" : "",
        dragging ? "is-dragging" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label={float.term}
      aria-modal="false"
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.animationName.includes("ic-pop-in")) setEnterAnim(false);
      }}
    >
      <div
        className="ic-float-head"
        onPointerDown={onHeadPointerDown}
        onPointerMove={onHeadPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        data-tip="拖动移动"
      >
        <strong className="ic-float-title">{float.term}</strong>
        <div className="ic-float-tools" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="ic-round"
            data-tip="深挖"
            aria-label="深挖"
            onClick={onDeepen}
          >
            <IconDeepen />
          </button>
          <button
            type="button"
            className="ic-round"
            data-tip="发散"
            aria-label="发散"
            onClick={onDiverge}
          >
            <IconDiverge />
          </button>
          <button
            type="button"
            className="ic-round"
            data-tip="引用到输入框"
            aria-label="引用"
            onClick={onQuote}
          >
            <IconQuote />
          </button>
          <button
            type="button"
            className="ic-round"
            data-tip="关闭"
            aria-label="关闭"
            onClick={onClose}
          >
            <IconX />
          </button>
        </div>
      </div>
      <div className="ic-float-body">
        {float.status === "loading" ? (
          <p className="ic-float-status" role="status" aria-live="polite">
            <span className="ic-float-spinner" aria-hidden />
            解释中…
          </p>
        ) : null}
        {float.status === "error" ? (
          <div className="ic-float-error" role="alert">
            <p>{float.error || "解释失败"}</p>
            <button type="button" className="ic-float-retry" onClick={onRetry}>
              重试
            </button>
          </div>
        ) : null}
        {float.status === "ready" ? (
          <p className="ic-float-explain">{float.body}</p>
        ) : null}
        <p className="ic-muted">短解释不建卡；要继续探究再选深挖 / 发散。拖动标题栏可移动。</p>
      </div>
    </div>
  );
}
