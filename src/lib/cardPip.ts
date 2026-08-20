/** Pure geometry + FSM helpers for YouTube-like card PiP. */

/** Hold this long after grab → enter PiP (shorter = snappier). */
export const PIP_HOLD_MS = 450;
export const PIP_MARGIN = 16;
export const PIP_GAP = 8;
export const COMMIT_PX = 56;
export const FLICK_VX = 0.45;

export type PipPhase = "entering" | "settled" | "expanding" | "closing";

export type PipGeom = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PipSession = PipGeom & {
  cardId: string;
  phase: PipPhase;
  /** FLIP origin (viewport) when entering */
  from?: { x: number; y: number; w: number; h: number };
};

export function defaultPipSize(vw = typeof window !== "undefined" ? window.innerWidth : 1280, vh = typeof window !== "undefined" ? window.innerHeight : 800): {
  w: number;
  h: number;
} {
  // Larger YouTube-like float; still fully clampable into the viewport.
  const w = Math.min(440, Math.max(320, Math.round(vw * 0.34)));
  const h = Math.min(300, Math.max(220, Math.round(w * 0.68)));
  return {
    w: Math.min(w, vw - PIP_MARGIN * 2),
    h: Math.min(h, vh - PIP_MARGIN * 2),
  };
}

/** Bottom-right fallback when no pointer anchor. */
export function defaultPipGeom(
  vw = typeof window !== "undefined" ? window.innerWidth : 1280,
  vh = typeof window !== "undefined" ? window.innerHeight : 800,
): PipGeom {
  const { w, h } = defaultPipSize(vw, vh);
  return {
    w,
    h,
    x: Math.max(PIP_GAP, vw - w - PIP_MARGIN),
    y: Math.max(PIP_GAP, vh - h - PIP_MARGIN),
  };
}

/**
 * PiP centered on the pointer (drag hold point), then clamped into the viewport.
 * Not auto bottom-right.
 */
export function pipGeomAtPointer(
  clientX: number,
  clientY: number,
  vw = typeof window !== "undefined" ? window.innerWidth : 1280,
  vh = typeof window !== "undefined" ? window.innerHeight : 800,
): PipGeom {
  const { w, h } = defaultPipSize(vw, vh);
  return clampPipGeom(
    {
      w,
      h,
      x: clientX - w / 2,
      y: clientY - h / 2,
    },
    vw,
    vh,
  );
}

export function clampPipGeom(
  g: PipGeom,
  vw = typeof window !== "undefined" ? window.innerWidth : 1280,
  vh = typeof window !== "undefined" ? window.innerHeight : 800,
): PipGeom {
  const w = Math.min(g.w, vw - PIP_GAP * 2);
  const h = Math.min(g.h, vh - PIP_GAP * 2);
  const x = Math.min(Math.max(PIP_GAP, g.x), Math.max(PIP_GAP, vw - w - PIP_GAP));
  const y = Math.min(Math.max(PIP_GAP, g.y), Math.max(PIP_GAP, vh - h - PIP_GAP));
  return { x, y, w, h };
}

export type CardPipMode = "idle" | "dragging" | "pip";

export type CardPipState = {
  mode: CardPipMode;
  peelDx: number;
  peelDy: number;
  session: PipSession | null;
};

export type CardPipEvent =
  | { type: "grab" }
  | { type: "move"; dx: number; dy: number }
  | { type: "release_cancel" }
  | { type: "release_flick" }
  | {
      type: "hold_pip";
      cardId: string;
      from: { x: number; y: number; w: number; h: number };
      /** Pointer position — PiP opens here (clamped). */
      anchorX: number;
      anchorY: number;
      vw: number;
      vh: number;
    }
  | { type: "pip_drag"; x: number; y: number; vw: number; vh: number }
  | { type: "pip_settle" }
  | { type: "expand_start" }
  | { type: "close_start" }
  | { type: "pip_done" };

export function initialCardPipState(): CardPipState {
  return { mode: "idle", peelDx: 0, peelDy: 0, session: null };
}

/** Pure reducer — UI side-effects (focusNode) stay outside. */
export function reduceCardPip(
  state: CardPipState,
  ev: CardPipEvent,
): CardPipState {
  switch (ev.type) {
    case "grab":
      if (state.mode === "pip") return state;
      return { mode: "dragging", peelDx: 0, peelDy: 0, session: null };

    case "move":
      if (state.mode !== "dragging") return state;
      return { ...state, peelDx: ev.dx, peelDy: ev.dy };

    case "release_cancel":
    case "release_flick":
      if (state.mode !== "dragging") return state;
      return initialCardPipState();

    case "hold_pip": {
      if (state.mode !== "dragging") return state;
      const base = pipGeomAtPointer(ev.anchorX, ev.anchorY, ev.vw, ev.vh);
      return {
        mode: "pip",
        peelDx: 0,
        peelDy: 0,
        session: {
          cardId: ev.cardId,
          ...base,
          phase: "entering",
          from: ev.from,
        },
      };
    }

    case "pip_settle":
      if (state.mode !== "pip" || !state.session) return state;
      return {
        ...state,
        session: { ...state.session, phase: "settled", from: undefined },
      };

    case "pip_drag":
      if (state.mode !== "pip" || !state.session) return state;
      return {
        ...state,
        session: {
          ...state.session,
          ...clampPipGeom(
            {
              x: ev.x,
              y: ev.y,
              w: state.session.w,
              h: state.session.h,
            },
            ev.vw,
            ev.vh,
          ),
          phase: "settled",
        },
      };

    case "expand_start":
      if (state.mode !== "pip" || !state.session) return state;
      return {
        ...state,
        session: { ...state.session, phase: "expanding" },
      };

    case "close_start":
      if (state.mode !== "pip" || !state.session) return state;
      return {
        ...state,
        session: { ...state.session, phase: "closing" },
      };

    case "pip_done":
      return initialCardPipState();

    default:
      return state;
  }
}
