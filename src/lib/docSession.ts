/** Pure DocSession FSM — card-main + read-only companion pane (PEL-156). */

export type DocKind = "md" | "text" | "pdf" | "unsupported";
export type DocLayout = "split" | "doc-wide" | "peek";
export type DocStatus = "closed" | "loading" | "ready" | "error" | "closing";

export type DocRef = {
  pathRel: string;
  displayName: string;
  kind: DocKind;
  size?: number;
};

export type DocSessionState = {
  status: DocStatus;
  ref: DocRef | null;
  layout: DocLayout;
  boundCardId: string | null;
  cursor: { page?: number; scrollTop?: number };
  error: string | null;
  /** Bumps on open/retry/force_close so stale load_* are dropped. */
  epoch: number;
  /** Ready-body cache for md/text; pdf guide may leave null. */
  textContent: string | null;
  /** Path from open — reused by retry. */
  requestPath: string | null;
};

export type DocSessionEvent =
  | { type: "open"; path: string; boundCardId?: string | null }
  | { type: "load_ok"; epoch: number; ref: DocRef; textContent?: string | null }
  | { type: "load_err"; epoch: number; error: string }
  | { type: "set_layout"; layout: DocLayout }
  | { type: "rebind"; boundCardId: string | null }
  | { type: "set_cursor"; cursor: DocSessionState["cursor"] }
  | { type: "retry" }
  | { type: "close" }
  | { type: "closed" }
  | { type: "force_close" };

export function initialDocSession(): DocSessionState {
  return {
    status: "closed",
    ref: null,
    layout: "split",
    boundCardId: null,
    cursor: {},
    error: null,
    epoch: 0,
    textContent: null,
    requestPath: null,
  };
}

function clearToClosed(
  state: DocSessionState,
  opts?: { bumpEpoch?: boolean },
): DocSessionState {
  return {
    status: "closed",
    ref: null,
    layout: state.layout,
    boundCardId: null,
    cursor: {},
    error: null,
    epoch: opts?.bumpEpoch ? state.epoch + 1 : state.epoch,
    textContent: null,
    requestPath: null,
  };
}

/** Pure reducer — Host IO and store side-effects stay outside. */
export function reduceDocSession(
  state: DocSessionState,
  ev: DocSessionEvent,
): DocSessionState {
  switch (ev.type) {
    case "open": {
      // Any non-terminal (and closed) open starts a new load; cancels prior epoch.
      return {
        ...state,
        status: "loading",
        epoch: state.epoch + 1,
        requestPath: ev.path,
        boundCardId: ev.boundCardId !== undefined ? ev.boundCardId : null,
        ref: null,
        textContent: null,
        error: null,
        cursor: {},
      };
    }

    case "load_ok": {
      if (ev.epoch !== state.epoch) return state;
      if (state.status !== "loading") return state;
      return {
        ...state,
        status: "ready",
        ref: ev.ref,
        textContent: ev.textContent ?? null,
        error: null,
      };
    }

    case "load_err": {
      if (ev.epoch !== state.epoch) return state;
      if (state.status !== "loading") return state;
      return {
        ...state,
        status: "error",
        error: ev.error,
        ref: null,
        textContent: null,
      };
    }

    case "set_layout": {
      if (state.status !== "ready") return state;
      return { ...state, layout: ev.layout };
    }

    case "rebind": {
      if (state.status !== "ready") return state;
      return { ...state, boundCardId: ev.boundCardId };
    }

    case "set_cursor": {
      if (state.status !== "ready") return state;
      return { ...state, cursor: ev.cursor };
    }

    case "retry": {
      if (state.status !== "error") return state;
      if (!state.requestPath) return state;
      return {
        ...state,
        status: "loading",
        epoch: state.epoch + 1,
        error: null,
        ref: null,
        textContent: null,
      };
    }

    case "close": {
      if (state.status === "closed" || state.status === "closing") return state;
      // ready / loading keep surface for exit anim; error closes immediately.
      if (state.status === "error") {
        return clearToClosed(state, { bumpEpoch: true });
      }
      return { ...state, status: "closing" };
    }

    case "closed": {
      if (state.status !== "closing") return state;
      return clearToClosed(state, { bumpEpoch: true });
    }

    case "force_close":
      // map / loadSnapshot / unbound — skip anim, drop inflight via epoch++.
      return clearToClosed(state, { bumpEpoch: true });

    default:
      return state;
  }
}
