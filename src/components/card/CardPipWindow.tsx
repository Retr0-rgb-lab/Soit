import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import type { PipSession } from "../../lib/cardPip";
import { clampPipGeom } from "../../lib/cardPip";
import { chromeFadeStyle, scrollChromeFade } from "../../lib/scrollChromeFade";

type Props = {
  session: PipSession;
  title: string;
  snippet: string;
  kindLabel: string;
  onExpand: () => void;
  onClose: () => void;
  onDragTo: (x: number, y: number) => void;
  onEntered: () => void;
  onExitDone: () => void;
};

/**
 * YouTube-like floating card — opens at pointer, viewport-clamped, scroll fades chrome.
 */
export default function CardPipWindow({
  session,
  title,
  snippet,
  kindLabel,
  onExpand,
  onClose,
  onDragTo,
  onEntered,
  onExitDone,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [chromeFade, setChromeFade] = useState(0);
  const dragRef = useRef<{
    pointerId: number;
    ox: number;
    oy: number;
    x0: number;
    y0: number;
  } | null>(null);

  const onBodyScroll = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    setChromeFade(scrollChromeFade(el.scrollTop, 56));
  }, []);

  // FLIP enter / exit lifecycle
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    if (session.phase === "entering" && session.from) {
      const from = session.from;
      const dx = from.x - session.x;
      const dy = from.y - session.y;
      const sx = from.w / session.w;
      const sy = from.h / session.h;
      el.style.transition = "none";
      el.style.transformOrigin = "top left";
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
      el.style.opacity = "1";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition =
            "transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.32s ease";
          el.style.transform = "translate(0,0) scale(1)";
          const done = () => {
            el.removeEventListener("transitionend", done);
            onEntered();
          };
          el.addEventListener("transitionend", done);
          window.setTimeout(done, 360);
        });
      });
      return;
    }

    if (session.phase === "expanding" || session.phase === "closing") {
      el.style.transition =
        "transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.22s ease";
      el.style.transformOrigin = "center center";
      if (session.phase === "expanding") {
        el.style.transform = "scale(1.08)";
        el.style.opacity = "0.35";
      } else {
        el.style.transform = "scale(0.86)";
        el.style.opacity = "0";
      }
      const done = () => {
        el.removeEventListener("transitionend", done);
        onExitDone();
      };
      el.addEventListener("transitionend", done);
      const t = window.setTimeout(done, 320);
      return () => window.clearTimeout(t);
    }
  }, [
    session.phase,
    session.from,
    session.x,
    session.y,
    session.w,
    session.h,
    onEntered,
    onExitDone,
  ]);

  useEffect(() => {
    const onResize = () => {
      const g = clampPipGeom(session, window.innerWidth, window.innerHeight);
      if (g.x !== session.x || g.y !== session.y) {
        onDragTo(g.x, g.y);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [session, onDragTo]);

  const onHeaderDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      ox: e.clientX,
      oy: e.clientY,
      x0: session.x,
      y0: session.y,
    };
  };

  const onHeaderMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const nx = d.x0 + (e.clientX - d.ox);
    const ny = d.y0 + (e.clientY - d.oy);
    const g = clampPipGeom(
      { x: nx, y: ny, w: session.w, h: session.h },
      window.innerWidth,
      window.innerHeight,
    );
    onDragTo(g.x, g.y);
  };

  const onHeaderUp = (e: ReactPointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  if (typeof document === "undefined") return null;

  const fadeStyle = chromeFadeStyle(chromeFade) as CSSProperties;

  return createPortal(
    <div
      ref={rootRef}
      className={`card-pip phase-${session.phase}${chromeFade > 0.02 ? " is-scrolled" : ""}`}
      style={{
        left: session.x,
        top: session.y,
        width: session.w,
        height: session.h,
      }}
      role="dialog"
      aria-label={`小窗 ${title}`}
    >
      <div
        className="card-pip-chrome"
        style={fadeStyle}
        onPointerDown={onHeaderDown}
        onPointerMove={onHeaderMove}
        onPointerUp={onHeaderUp}
        onPointerCancel={onHeaderUp}
      >
        <span className="card-pip-kind">{kindLabel}</span>
        <span className="card-pip-title">{title}</span>
        <div className="card-pip-actions">
          <button
            type="button"
            className="card-pip-btn"
            aria-label="放大为正常卡片"
            title="放大"
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M9 3H3v6M15 3h6v6M9 21H3v-6M21 15v6h-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="card-pip-btn danger"
            aria-label="关闭小窗"
            title="关闭"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
      <div
        ref={bodyRef}
        className="card-pip-body"
        onScroll={onBodyScroll}
      >
        <p className="card-pip-snippet">{snippet}</p>
      </div>
    </div>,
    document.body,
  );
}
