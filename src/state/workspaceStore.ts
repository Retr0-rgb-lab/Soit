import { create } from "zustand";
import type { CardBrief } from "../lib/cardBrief";
import {
  initialDocSession,
  reduceDocSession,
  type DocLayout,
  type DocRef,
  type DocSessionState,
} from "../lib/docSession";
import {
  LIVE_MAX,
  pinLiveId,
  unpinLiveId,
} from "../lib/liveSet";
import type { MapScopeMode } from "../lib/mapScope";
import type { RuntimeInfo, RuntimePreferences } from "../lib/runtime";
import { rootOf, subtreeIds } from "../lib/threadDebt";
import type {
  Edge,
  InquiryNode,
  SourceSpan,
  Turn,
  VaultDocKind,
  WorkspaceSnapshot,
} from "../types";
import { createChatActions } from "./chatActions";
import { createRuntimeActions } from "./runtimeActions";
import {
  afterFocus,
  cloneEdges,
  hostClearUnread,
  memorySpawnInquiry,
  mergeHostSnapshot,
} from "./spawnMerge";
import {
  isUniverseSource,
  resetIdSeq,
  type StoreGet,
  type StoreSet,
} from "./turnHelpers";

export type WorkspaceMode = "focus" | "map";

export const UNREAD_RAIL_CAP = 12;
export { LIVE_MAX };

export interface SpawnInquiryInput {
  kind: "deepen" | "diverge";
  source: SourceSpan;
  why?: string;
  actor?: "user" | "agent";
  /** Parent card id; defaults to current focusId */
  fromCardId?: string;
}

/** In-flight Inquiry complete (Spec §2.1) — gen is the sole race token. */
export interface InquiryInflight {
  cardId: string;
  turnId: string;
  gen: string;
  controller: AbortController;
}

/** External runtime handoff state (Spec §2.6 / §2.8). */
export interface RuntimeRun {
  runId: string;
  cardId: string;
  turnId: string;
  runtimeId: string;
  status: "staging" | "running" | "succeeded" | "failed" | "cancelled";
  detail?: string;
}

export interface WorkspaceState {
  nodes: InquiryNode[];
  turnsByCardId: Record<string, Turn[]>;
  edges: Edge[];
  focusId: string;
  source: WorkspaceSnapshot["source"] | null;
  /** Bound vault path from host bootstrap / open_universe */
  vaultPath: string | null;
  workspaceMode: WorkspaceMode;
  mapScopeMode: MapScopeMode;
  recentIds: string[];
  /** Explicitly live threads (card ids), soft max LIVE_MAX */
  liveIds: string[];
  /** Cards touched this app session */
  sessionTouchIds: string[];
  /** For re-entry banner: previous focus when snapshot loaded */
  resumeHintId: string | null;
  reentryDismissed: boolean;
  /** Return-to-source highlight target (cleared after flash). */
  highlightSpan: SourceSpan | null;
  /**
   * Monotonic boot/load generation (Spec §6.3).
   * Stale `loadSnapshot(snap, epoch)` is ignored when epoch !== bootEpoch.
   */
  bootEpoch: number;
  /** Active Inquiry complete; null when idle. */
  inquiryInflight: InquiryInflight | null;
  /** Runtime prefs mirror; null until loadRuntimePrefs. */
  runtimePrefs: RuntimePreferences | null;
  /** Detected runtimes from last refreshRuntimes. */
  runtimes: RuntimeInfo[];
  /** Active external handoff; null when idle. */
  runtimeRun: RuntimeRun | null;
  /** Read-only doc companion session (PEL-156); not persisted. */
  docSession: DocSessionState;

  /** Bump epoch for an async App / openUniverse load pipeline; returns new epoch. */
  beginBootLoad: () => number;
  loadSnapshot: (snap: WorkspaceSnapshot, epoch?: number) => void;
  setVaultPath: (path: string | null) => void;
  focusNode: (id: string) => void;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  setMapScopeMode: (mode: MapScopeMode) => void;
  toggleMapMode: () => void;
  /** Open vault doc companion (async resolve/read). */
  openDoc: (path: string, boundCardId?: string | null) => Promise<void>;
  closeDoc: () => void;
  /** Complete close anim (closing → closed). */
  confirmDocClosed: () => void;
  setDocLayout: (layout: DocLayout) => void;
  rebindDoc: (boundCardId: string | null) => void;
  retryDoc: () => Promise<void>;
  pinLive: (id: string) => void;
  unpinLive: (id: string) => void;
  /** Mark all unread in thread (by root) as read */
  markThreadRead: (anyIdInThread: string) => void;
  dismissReentry: () => void;
  /** Unified spawn — user and agent share this entry. */
  spawnInquiry: (input: SpawnInquiryInput) => Promise<string>;
  /** @deprecated thin wrapper → spawnInquiry */
  spawnDeepen: (sourceLabel: string) => Promise<string>;
  /** @deprecated thin wrapper → spawnInquiry */
  spawnDiverge: (sourceLabel: string) => Promise<string>;
  /** Focus parent and request mark highlight from inbound edge / span. */
  returnToSource: (span?: SourceSpan | null) => void;
  clearHighlight: () => void;
  /** Prefer (cardId, turnId). cardId optional → resolve only under current focusId. */
  regenerateTurn: (turnId: string, cardId?: string) => Promise<void>;
  deleteTurn: (turnId: string, cardId?: string) => Promise<void>;
  toggleTurnCollapsed: (turnId: string, cardId?: string) => Promise<void>;
  /** Fire-and-forget OK; returns when assistant turn is filled via ChatPort. */
  appendUserMessage: (text: string, quote?: string) => Promise<void>;
  /** Abort in-flight Inquiry complete; late results must not write. */
  cancelInflight: () => void;
  refreshRuntimes: () => Promise<void>;
  loadRuntimePrefs: () => Promise<void>;
  setRuntimePrefs: (p: Partial<RuntimePreferences>) => Promise<void>;
  startRuntimeHandoff: (opts?: {
    cardId?: string;
    runtimeId?: string;
  }) => Promise<void>;
  cancelRuntimeHandoff: () => Promise<void>;
  exportCardBrief: (cardId?: string) => Promise<CardBrief>;
  importAssistantToFocus: (
    raw: string,
    opts?: { asResidue?: boolean },
  ) => Promise<void>;
}

function resolveRootId(
  nodes: InquiryNode[],
  focusId: string,
): string {
  const focusNode = nodes.find((n) => n.id === focusId);
  let rootId = focusId;
  if (focusNode?.parentId) {
    let cur: typeof focusNode | undefined = focusNode;
    const guard = new Set<string>();
    while (cur?.parentId && !guard.has(cur.id)) {
      guard.add(cur.id);
      cur = nodes.find((n) => n.id === cur!.parentId);
    }
    if (cur) rootId = cur.id;
  }
  return rootId;
}

/** Finish open/retry load after reduce → loading (epoch already bumped). */
async function finishDocLoad(
  get: () => WorkspaceState,
  set: (partial: Partial<WorkspaceState>) => void,
  path: string,
  epoch: number,
): Promise<void> {
  try {
    const { resolveVaultDoc, readVaultText } = await import("../lib/host");
    const resolved = await resolveVaultDoc(path);
    if (get().docSession.epoch !== epoch) return;
    if (!resolved.ok || !resolved.pathRel || !resolved.kind) {
      set({
        docSession: reduceDocSession(get().docSession, {
          type: "load_err",
          epoch,
          error: resolved.error ?? "resolve failed",
        }),
      });
      return;
    }
    const kind = resolved.kind as VaultDocKind;
    const ref: DocRef = {
      pathRel: resolved.pathRel,
      displayName: resolved.displayName ?? resolved.pathRel.split("/").pop() ?? resolved.pathRel,
      kind,
      size: resolved.size,
    };
    if (kind === "md" || kind === "text") {
      const read = await readVaultText(resolved.pathRel);
      if (get().docSession.epoch !== epoch) return;
      if (!read.ok) {
        set({
          docSession: reduceDocSession(get().docSession, {
            type: "load_err",
            epoch,
            error: read.error ?? "read failed",
          }),
        });
        return;
      }
      set({
        docSession: reduceDocSession(get().docSession, {
          type: "load_ok",
          epoch,
          ref,
          textContent: read.text ?? null,
        }),
      });
      return;
    }
    // pdf | unsupported — ready without text body (guide UI in D4).
    set({
      docSession: reduceDocSession(get().docSession, {
        type: "load_ok",
        epoch,
        ref,
        textContent: null,
      }),
    });
  } catch (err) {
    if (get().docSession.epoch !== epoch) return;
    const message = err instanceof Error ? err.message : String(err);
    set({
      docSession: reduceDocSession(get().docSession, {
        type: "load_err",
        epoch,
        error: message || "load failed",
      }),
    });
  }
}

export const useWorkspace = create<WorkspaceState>((set, get) => {
  const chat = createChatActions(set as StoreSet, get as StoreGet);
  const runtime = createRuntimeActions(set as StoreSet, get as StoreGet);

  return {
    nodes: [],
    turnsByCardId: {},
    edges: [],
    focusId: "",
    source: null,
    vaultPath: null,
    workspaceMode: "focus",
    mapScopeMode: "working",
    recentIds: [],
    liveIds: [],
    sessionTouchIds: [],
    resumeHintId: null,
    reentryDismissed: true,
    highlightSpan: null,
    bootEpoch: 0,
    inquiryInflight: null,
    runtimePrefs: null,
    runtimes: [],
    runtimeRun: null,
    docSession: initialDocSession(),

    beginBootLoad: () => {
      const next = get().bootEpoch + 1;
      set({ bootEpoch: next });
      return next;
    },

    setVaultPath: (path) => set({ vaultPath: path }),

    loadSnapshot: (snap, epoch) => {
      if (epoch !== undefined && epoch !== get().bootEpoch) return;
      // Drop in-flight complete so stale writes cannot land after reload.
      const prevInflight = get().inquiryInflight;
      if (prevInflight) {
        try {
          prevInflight.controller.abort();
        } catch {
          /* ignore */
        }
      }
      if (get().runtimeRun) {
        void import("../lib/host")
          .then((h) => h.cancelRuntimeHandoff())
          .catch(() => {
            /* ignore */
          });
      }
      resetIdSeq();
      const prev = get();
      const prevFocus = prev.focusId;
      const keepMap = prev.workspaceMode === "map" && snap.source === "demo";
      const rootId = resolveRootId(snap.nodes, snap.focusId);
      set({
        nodes: snap.nodes.map((n) => ({ ...n })),
        turnsByCardId: Object.fromEntries(
          Object.entries(snap.turnsByCardId).map(([k, turns]) => [
            k,
            turns.map((t) => ({ ...t })),
          ]),
        ),
        edges: cloneEdges(snap.edges),
        focusId: snap.focusId,
        source: snap.source,
        workspaceMode: keepMap ? "map" : "focus",
        mapScopeMode: keepMap ? prev.mapScopeMode : "working",
        recentIds: snap.focusId ? [snap.focusId] : [],
        liveIds: snap.focusId ? [rootId] : [],
        sessionTouchIds: snap.focusId ? [snap.focusId] : [],
        resumeHintId:
          prevFocus && prevFocus !== snap.focusId ? prevFocus : snap.focusId,
        reentryDismissed: keepMap ? true : false,
        highlightSpan: null,
        inquiryInflight: null,
        runtimeRun: null,
        // Always drop doc companion (unbind / boot / host merge).
        docSession: reduceDocSession(prev.docSession, { type: "force_close" }),
      });
    },

    focusNode: (id) => {
      const s0 = get();
      if (!s0.nodes.some((n) => n.id === id)) return;
      const target = s0.nodes.find((n) => n.id === id);
      const wasUnread = Boolean(target?.unread);
      const prevFocus = s0.focusId;
      const focused = afterFocus(s0, id);
      // Keep doc session; rebind when unbound or still tied to previous focus.
      let docSession = s0.docSession;
      if (
        docSession.status === "ready" &&
        (docSession.boundCardId === null || docSession.boundCardId === prevFocus)
      ) {
        docSession = reduceDocSession(docSession, {
          type: "rebind",
          boundCardId: id,
        });
      }
      set({ ...focused, docSession });
      if (wasUnread && isUniverseSource(s0.source)) {
        hostClearUnread([id]);
      }
    },

    setWorkspaceMode: (mode) =>
      set((s) => {
        if (mode === "map") {
          return {
            workspaceMode: mode,
            docSession: reduceDocSession(s.docSession, { type: "force_close" }),
          };
        }
        return { workspaceMode: mode };
      }),

    setMapScopeMode: (mode) => set({ mapScopeMode: mode }),

    toggleMapMode: () =>
      set((s) => {
        const next: WorkspaceMode =
          s.workspaceMode === "map" ? "focus" : "map";
        if (next === "map") {
          return {
            workspaceMode: next,
            docSession: reduceDocSession(s.docSession, { type: "force_close" }),
          };
        }
        return { workspaceMode: next };
      }),

    openDoc: async (path, boundCardId) => {
      const bound =
        boundCardId !== undefined ? boundCardId : get().focusId || null;
      set({
        docSession: reduceDocSession(get().docSession, {
          type: "open",
          path,
          boundCardId: bound,
        }),
      });
      const epoch = get().docSession.epoch;
      await finishDocLoad(get, set, path, epoch);
    },

    closeDoc: () => {
      set({
        docSession: reduceDocSession(get().docSession, { type: "close" }),
      });
    },

    confirmDocClosed: () => {
      set({
        docSession: reduceDocSession(get().docSession, { type: "closed" }),
      });
    },

    setDocLayout: (layout) => {
      set({
        docSession: reduceDocSession(get().docSession, {
          type: "set_layout",
          layout,
        }),
      });
    },

    rebindDoc: (boundCardId) => {
      set({
        docSession: reduceDocSession(get().docSession, {
          type: "rebind",
          boundCardId,
        }),
      });
    },

    retryDoc: async () => {
      const before = get().docSession;
      if (before.status !== "error" || !before.requestPath) return;
      const path = before.requestPath;
      set({
        docSession: reduceDocSession(before, { type: "retry" }),
      });
      const epoch = get().docSession.epoch;
      await finishDocLoad(get, set, path, epoch);
    },

    pinLive: (id) => {
      const s = get();
      const root = rootOf(s.nodes, id);
      const target = root?.id ?? id;
      const { liveIds } = pinLiveId(s.liveIds, target, LIVE_MAX);
      set({ liveIds });
    },

    unpinLive: (id) => {
      set((s) => ({ liveIds: unpinLiveId(s.liveIds, id) }));
    },

    markThreadRead: (anyIdInThread) => {
      const s = get();
      const root = rootOf(s.nodes, anyIdInThread);
      if (!root) return;
      const ids = new Set(subtreeIds(s.nodes, root.id));
      const cleared = s.nodes
        .filter((n) => ids.has(n.id) && n.unread)
        .map((n) => n.id);
      set({
        nodes: s.nodes.map((n) =>
          ids.has(n.id) && n.unread ? { ...n, unread: false } : n,
        ),
      });
      if (isUniverseSource(s.source) && cleared.length > 0) {
        hostClearUnread(cleared);
      }
    },

    dismissReentry: () => set({ reentryDismissed: true }),

    spawnInquiry: async (input) => {
      const s0 = get();
      const fromCardId = input.fromCardId ?? s0.focusId;
      if (!fromCardId) return "";

      // Universe path: Host only — never memorySpawnInquiry (Spec §6.1).
      if (isUniverseSource(s0.source)) {
        try {
          const { spawnInquiry: hostSpawn } = await import("../lib/host");
          const snap = await hostSpawn({
            kind: input.kind,
            fromCardId,
            source: input.source,
            why: input.why,
            actor: input.actor ?? "user",
          });
          // Host sets snap.focusId to the new child.
          const created = snap.focusId || "";
          if (!created) return "";
          mergeHostSnapshot(get as StoreGet, set as StoreSet, snap, created);
          return created;
        } catch (err) {
          console.error("[soit] spawn_inquiry host failed", err);
          return "";
        }
      }

      return memorySpawnInquiry(get as StoreGet, set as StoreSet, input);
    },

    spawnDeepen: (sourceLabel) => {
      const s = get();
      const turns = s.turnsByCardId[s.focusId] ?? [];
      const last = turns[turns.length - 1];
      return get().spawnInquiry({
        kind: "deepen",
        source: {
          turnId: last?.id ?? "",
          text: sourceLabel.slice(0, 48),
        },
        actor: "user",
      });
    },

    spawnDiverge: (sourceLabel) => {
      const s = get();
      const turns = s.turnsByCardId[s.focusId] ?? [];
      const last = turns[turns.length - 1];
      return get().spawnInquiry({
        kind: "diverge",
        source: {
          turnId: last?.id ?? "",
          text: sourceLabel.slice(0, 48),
        },
        actor: "user",
      });
    },

    returnToSource: (span) => {
      const s = get();
      const focus = s.nodes.find((n) => n.id === s.focusId);
      const parentId = focus?.parentId;
      if (!parentId) return;

      let target = span ?? null;
      if (!target) {
        const edge = s.edges.find((e) => e.toCardId === s.focusId);
        if (edge) target = { ...edge.source };
      }
      const focused = afterFocus(s, parentId);
      set({
        ...focused,
        highlightSpan: target,
        workspaceMode: "focus",
      });
    },

    clearHighlight: () => set({ highlightSpan: null }),

    regenerateTurn: chat.regenerateTurn,
    deleteTurn: chat.deleteTurn,
    toggleTurnCollapsed: chat.toggleTurnCollapsed,
    appendUserMessage: chat.appendUserMessage,
    cancelInflight: chat.cancelInflight,

    refreshRuntimes: runtime.refreshRuntimes,
    loadRuntimePrefs: runtime.loadRuntimePrefs,
    setRuntimePrefs: runtime.setRuntimePrefs,
    startRuntimeHandoff: runtime.startRuntimeHandoff,
    cancelRuntimeHandoff: runtime.cancelRuntimeHandoff,
    exportCardBrief: runtime.exportCardBrief,
    importAssistantToFocus: runtime.importAssistantToFocus,
  };
});

export const useWorkspaceStore = useWorkspace;
