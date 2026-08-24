import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  cardPeekSnippet,
  resolveCardDragNav,
  resolveForwardNav,
} from "../../lib/cardDragNav";
import {
  COMMIT_PX,
  FLICK_VX,
  PIP_HOLD_MS,
  initialCardPipState,
  reduceCardPip,
  type CardPipState,
} from "../../lib/cardPip";
import type { FocusNavKind } from "../../lib/focusMotion";
import type { InquiryNode, Turn } from "../../types";

type Args = {
  focusId: string | null;
  nodes: InquiryNode[];
  turnsByCardId: Record<string, Turn[]>;
  /** Main stage card element — FLIP origin */
  cardWrapRef: React.RefObject<HTMLElement | null>;
  onFocusCard: (id: string, kind: FocusNavKind) => void;
};

function kindLabel(kind: FocusNavKind | string): string {
  if (kind === "deepen") return "深挖";
  if (kind === "diverge") return "发散";
  if (kind === "back") return "返回";
  return "卡片";
}

export function useCardPip({
  focusId,
  nodes,
  turnsByCardId,
  cardWrapRef,
  onFocusCard,
}: Args) {
  const [state, dispatch] = useReducer(reduceCardPip, undefined, initialCardPipState);
  const stateRef = useRef<CardPipState>(state);
  stateRef.current = state;

  const focusIdRef = useRef(focusId);
  const nodesRef = useRef(nodes);
  const onFocusRef = useRef(onFocusCard);
  focusIdRef.current = focusId;
  nodesRef.current = nodes;
  onFocusRef.current = onFocusCard;

  const dragRef = useRef<{
    pointerId: number;
    x0: number;
    y0: number;
    t0: number;
    lastX: number;
    lastY: number;
    holdTimer: number;
  } | null>(null);

  const pendingExpandId = useRef<string | null>(null);

  const clearHold = () => {
    const d = dragRef.current;
    if (d?.holdTimer) {
      window.clearTimeout(d.holdTimer);
      d.holdTimer = 0;
    }
  };

  const enterPip = useCallback(() => {
    const d = dragRef.current;
    const fid = focusIdRef.current;
    if (!d || !fid || stateRef.current.mode !== "dragging") return;

    const el = cardWrapRef.current;
    const rect = el?.getBoundingClientRect();
    const from = rect
      ? { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
      : { x: 80, y: 80, w: 480, h: 320 };

    const dx = d.lastX - d.x0;
    const dy = d.lastY - d.y0;
    const nav =
      resolveCardDragNav(fid, nodesRef.current, dx, dy, COMMIT_PX * 0.35) ??
      resolveForwardNav(fid, nodesRef.current);

    // Open at the peeled card's current on-screen center (drag origin), else pointer.
    const anchorX = rect
      ? rect.left + rect.width / 2
      : d.lastX;
    const anchorY = rect
      ? rect.top + rect.height / 2
      : d.lastY;

    dispatch({
      type: "hold_pip",
      cardId: fid,
      from,
      anchorX,
      anchorY,
      vw: window.innerWidth,
      vh: window.innerHeight,
    });

    // Stage takes the next card (YouTube: main area continues with other content).
    if (nav && nav.targetId !== fid) {
      onFocusRef.current(nav.targetId, nav.kind);
    }

    clearHold();
    dragRef.current = null;
  }, [cardWrapRef]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (stateRef.current.mode !== "dragging") return;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      dispatch({
        type: "move",
        dx: e.clientX - d.x0,
        dy: e.clientY - d.y0,
      });
    };

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (stateRef.current.mode !== "dragging") {
        dragRef.current = null;
        return;
      }

      const fid = focusIdRef.current;
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      const dt = Math.max(1, performance.now() - d.t0);
      const dist = Math.hypot(dx, dy);
      const speed = dist / dt;
      clearHold();
      dragRef.current = null;

      if (!fid) {
        dispatch({ type: "release_cancel" });
        return;
      }

      const nav = resolveCardDragNav(fid, nodesRef.current, dx, dy, COMMIT_PX);
      const flick = Boolean(nav) && (dist >= COMMIT_PX || speed >= FLICK_VX);
      if (flick && nav) {
        dispatch({ type: "release_flick" });
        onFocusRef.current(nav.targetId, nav.kind);
        return;
      }
      dispatch({ type: "release_cancel" });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const onDragSurfacePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.closest("button, a, input, textarea, select, [role='button']")) {
          return;
        }
      }
      if (!focusId) return;
      // Don't start peel-drag while already in pip for another session
      if (stateRef.current.mode === "pip") return;

      e.preventDefault();
      try {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }

      dispatch({ type: "grab" });
      const now = performance.now();
      dragRef.current = {
        pointerId: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        t0: now,
        lastX: e.clientX,
        lastY: e.clientY,
        holdTimer: 0,
      };
      dragRef.current.holdTimer = window.setTimeout(() => {
        enterPip();
      }, PIP_HOLD_MS);
    },
    [focusId, enterPip],
  );

  const onPipDragTo = useCallback((x: number, y: number) => {
    dispatch({
      type: "pip_drag",
      x,
      y,
      vw: window.innerWidth,
      vh: window.innerHeight,
    });
  }, []);

  const onPipEntered = useCallback(() => {
    dispatch({ type: "pip_settle" });
  }, []);

  const onExpand = useCallback(() => {
    const s = stateRef.current.session;
    if (!s) return;
    pendingExpandId.current = s.cardId;
    dispatch({ type: "expand_start" });
  }, []);

  const onClose = useCallback(() => {
    pendingExpandId.current = null;
    dispatch({ type: "close_start" });
  }, []);

  const onExitDone = useCallback(() => {
    const expandId = pendingExpandId.current;
    pendingExpandId.current = null;
    dispatch({ type: "pip_done" });
    if (expandId) {
      const node = nodesRef.current.find((n) => n.id === expandId);
      const kind: FocusNavKind =
        node?.kind === "deepen"
          ? "deepen"
          : node?.kind === "diverge"
            ? "diverge"
            : "jump";
      onFocusRef.current(expandId, kind);
    }
  }, []);

  // Esc closes pip
  useEffect(() => {
    if (state.mode !== "pip") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [state.mode, onClose]);

  const pipCardId = state.session?.cardId ?? null;
  const pipMeta = (() => {
    if (!pipCardId) return null;
    const node = nodes.find((n) => n.id === pipCardId);
    const turns = turnsByCardId[pipCardId] ?? [];
    const kind: FocusNavKind =
      node?.kind === "deepen"
        ? "deepen"
        : node?.kind === "diverge"
          ? "diverge"
          : "jump";
    return {
      title: node?.title ?? "卡片",
      snippet: cardPeekSnippet(turns, 160),
      kindLabel: kindLabel(kind),
    };
  })();

  const peel =
    state.mode === "dragging"
      ? {
          dx: state.peelDx,
          dy: state.peelDy,
          peeling: Math.hypot(state.peelDx, state.peelDy) >= 8,
        }
      : null;

  return {
    mode: state.mode,
    peel,
    session: state.session,
    pipMeta,
    onDragSurfacePointerDown,
    onDragSurfacePointerMove: (_e: ReactPointerEvent) => {},
    onDragSurfacePointerUp: (_e: ReactPointerEvent) => {},
    onDragSurfacePointerCancel: (_e: ReactPointerEvent) => {},
    onPipDragTo,
    onPipEntered,
    onExpand,
    onClose,
    onExitDone,
  };
}
