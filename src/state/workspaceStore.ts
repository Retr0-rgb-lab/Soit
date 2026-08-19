import { create } from "zustand";
import {
  LIVE_MAX,
  pinLiveId,
  touchSession,
  unpinLiveId,
} from "../lib/liveSet";
import type { MapScopeMode } from "../lib/mapScope";
import { rootOf, subtreeIds } from "../lib/threadDebt";
import type { InquiryNode, NodeKind, Turn, WorkspaceSnapshot } from "../types";

export type WorkspaceMode = "focus" | "map";

const RECENT_MAX = 8;
export const UNREAD_RAIL_CAP = 12;
export { LIVE_MAX };

export interface WorkspaceState {
  nodes: InquiryNode[];
  turnsByCardId: Record<string, Turn[]>;
  focusId: string;
  source: WorkspaceSnapshot["source"] | null;
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

  loadSnapshot: (snap: WorkspaceSnapshot) => void;
  focusNode: (id: string) => void;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  setMapScopeMode: (mode: MapScopeMode) => void;
  toggleMapMode: () => void;
  pinLive: (id: string) => void;
  unpinLive: (id: string) => void;
  /** Mark all unread in thread (by root) as read */
  markThreadRead: (anyIdInThread: string) => void;
  dismissReentry: () => void;
  spawnDeepen: (sourceLabel: string) => string;
  spawnDiverge: (sourceLabel: string) => string;
  regenerateTurn: (turnId: string) => void;
  deleteTurn: (turnId: string) => void;
  toggleTurnCollapsed: (turnId: string) => void;
  appendUserMessage: (text: string, quote?: string) => void;
}

function pushRecent(recentIds: string[], id: string, prevFocus: string): string[] {
  const next = [
    id,
    ...recentIds.filter((x) => x !== id && x !== prevFocus),
  ];
  if (prevFocus && prevFocus !== id) {
    next.splice(1, 0, prevFocus);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of next) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
    if (out.length >= RECENT_MAX) break;
  }
  return out;
}

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeq}`;
}

function spawnChild(
  get: () => WorkspaceState,
  set: (
    partial:
      | Partial<WorkspaceState>
      | ((s: WorkspaceState) => Partial<WorkspaceState>),
  ) => void,
  kind: Exclude<NodeKind, "root">,
  sourceLabel: string,
): string {
  const parentId = get().focusId;
  const id = nextId(kind === "deepen" ? "d" : "v");
  const title =
    (kind === "deepen" ? "深挖 · " : "发散 · ") + sourceLabel.slice(0, 12);
  const node: InquiryNode = {
    id,
    title,
    parentId: parentId || null,
    kind,
    unread: true,
  };
  const turn: Turn = {
    id: nextId("t"),
    title: kind === "deepen" ? "深挖开场" : "发散开场",
    collapsed: false,
    user:
      kind === "deepen"
        ? `从「${sourceLabel}」往下：它具体指什么？`
        : `另开一条：和「${sourceLabel}」平行的问题。`,
    think:
      kind === "deepen"
        ? "深挖：父状态 + 源跨度；不整段灌父 transcript。"
        : "发散：空白对话 + 回边；父卡继续活。",
    thinkOpen: false,
    aiHtml:
      kind === "deepen"
        ? `这是对「${sourceLabel}」的深挖卡。（demo 占位）`
        : `这是平行发散，回边指向「${sourceLabel}」。（demo 占位）`,
  };
  set((s) => ({
    nodes: [...s.nodes, node],
    turnsByCardId: { ...s.turnsByCardId, [id]: [turn] },
    focusId: id,
  }));
  return id;
}

function afterFocus(
  s: WorkspaceState,
  id: string,
): Pick<
  WorkspaceState,
  "focusId" | "recentIds" | "sessionTouchIds" | "liveIds" | "nodes"
> {
  const idx = s.nodes.findIndex((n) => n.id === id);
  const target = idx >= 0 ? s.nodes[idx] : null;
  const nodes =
    !target || target.unread === false
      ? s.nodes
      : s.nodes.map((n, i) => (i === idx ? { ...n, unread: false } : n));

  const root = rootOf(nodes, id);
  const liveTarget = root?.id ?? id;
  const { liveIds } = pinLiveId(s.liveIds, liveTarget, LIVE_MAX);

  return {
    focusId: id,
    recentIds: pushRecent(s.recentIds, id, s.focusId),
    sessionTouchIds: touchSession(s.sessionTouchIds, id),
    liveIds,
    nodes,
  };
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  nodes: [],
  turnsByCardId: {},
  focusId: "",
  source: null,
  workspaceMode: "focus",
  mapScopeMode: "working",
  recentIds: [],
  liveIds: [],
  sessionTouchIds: [],
  resumeHintId: null,
  reentryDismissed: true,

  loadSnapshot: (snap) => {
    idSeq = 0;
    const prev = get();
    const prevFocus = prev.focusId;
    const keepMap = prev.workspaceMode === "map";
    const focusNode = snap.nodes.find((n) => n.id === snap.focusId);
    // Prefer tree root of focus for live set
    let rootId = snap.focusId;
    if (focusNode?.parentId) {
      let cur: typeof focusNode | undefined = focusNode;
      const guard = new Set<string>();
      while (cur?.parentId && !guard.has(cur.id)) {
        guard.add(cur.id);
        cur = snap.nodes.find((n) => n.id === cur!.parentId);
      }
      if (cur) rootId = cur.id;
    }
    set({
      nodes: snap.nodes.map((n) => ({ ...n })),
      turnsByCardId: Object.fromEntries(
        Object.entries(snap.turnsByCardId).map(([k, turns]) => [
          k,
          turns.map((t) => ({ ...t })),
        ]),
      ),
      focusId: snap.focusId,
      source: snap.source,
      // Keep map open when reloading stress seeds from MapStage
      workspaceMode: keepMap ? "map" : "focus",
      mapScopeMode: keepMap ? prev.mapScopeMode : "working",
      recentIds: snap.focusId ? [snap.focusId] : [],
      liveIds: snap.focusId ? [rootId] : [],
      sessionTouchIds: snap.focusId ? [snap.focusId] : [],
      resumeHintId:
        prevFocus && prevFocus !== snap.focusId ? prevFocus : snap.focusId,
      // Don't flash re-entry banner on DEV stress reloads while already in map
      reentryDismissed: keepMap ? true : false,
    });
  },

  focusNode: (id) => {
    const s0 = get();
    if (!s0.nodes.some((n) => n.id === id)) return;
    set(afterFocus(s0, id));
  },

  setWorkspaceMode: (mode) => set({ workspaceMode: mode }),

  setMapScopeMode: (mode) => set({ mapScopeMode: mode }),

  toggleMapMode: () =>
    set((s) => ({
      workspaceMode: s.workspaceMode === "map" ? "focus" : "map",
    })),

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
    set({
      nodes: s.nodes.map((n) =>
        ids.has(n.id) && n.unread ? { ...n, unread: false } : n,
      ),
    });
  },

  dismissReentry: () => set({ reentryDismissed: true }),

  spawnDeepen: (sourceLabel) => {
    const prev = get().focusId;
    const id = spawnChild(get, set, "deepen", sourceLabel);
    const s = get();
    const root = rootOf(s.nodes, id);
    const { liveIds } = pinLiveId(s.liveIds, root?.id ?? id, LIVE_MAX);
    set({
      workspaceMode: "focus",
      recentIds: pushRecent(s.recentIds, id, prev),
      sessionTouchIds: touchSession(s.sessionTouchIds, id),
      liveIds,
    });
    return id;
  },

  spawnDiverge: (sourceLabel) => {
    const prev = get().focusId;
    const id = spawnChild(get, set, "diverge", sourceLabel);
    const s = get();
    const root = rootOf(s.nodes, id);
    const { liveIds } = pinLiveId(s.liveIds, root?.id ?? id, LIVE_MAX);
    set({
      workspaceMode: "focus",
      recentIds: pushRecent(s.recentIds, id, prev),
      sessionTouchIds: touchSession(s.sessionTouchIds, id),
      liveIds,
    });
    return id;
  },

  regenerateTurn: (turnId) => {
    set((s) => {
      const next: Record<string, Turn[]> = {};
      for (const [cardId, turns] of Object.entries(s.turnsByCardId)) {
        next[cardId] = turns.map((t) =>
          t.id === turnId
            ? { ...t, aiHtml: `${t.aiHtml}<p><em>（已重生 · demo）</em></p>` }
            : t,
        );
      }
      return { turnsByCardId: next };
    });
  },

  deleteTurn: (turnId) => {
    set((s) => {
      const next: Record<string, Turn[]> = {};
      for (const [cardId, turns] of Object.entries(s.turnsByCardId)) {
        next[cardId] = turns.filter((t) => t.id !== turnId);
      }
      return { turnsByCardId: next };
    });
  },

  toggleTurnCollapsed: (turnId) => {
    set((s) => {
      const next: Record<string, Turn[]> = {};
      for (const [cardId, turns] of Object.entries(s.turnsByCardId)) {
        next[cardId] = turns.map((t) =>
          t.id === turnId ? { ...t, collapsed: !t.collapsed } : t,
        );
      }
      return { turnsByCardId: next };
    });
  },

  appendUserMessage: (text, quote) => {
    const focusId = get().focusId;
    if (!focusId || !text.trim()) return;
    const body = quote ? `> ${quote}\n\n${text}` : text;
    const turn: Turn = {
      id: nextId("t"),
      title: text.slice(0, 16) || "新消息",
      collapsed: false,
      user: body,
      think: "demo 回复",
      thinkOpen: false,
      aiHtml:
        '已记在本卡对话路径里。点下划线的<span class="mark" data-term="函子">函子</span>可继续分叉。',
    };
    set((s) => ({
      turnsByCardId: {
        ...s.turnsByCardId,
        [focusId]: [...(s.turnsByCardId[focusId] ?? []), turn],
      },
      sessionTouchIds: touchSession(s.sessionTouchIds, focusId),
    }));
  },
}));

export const useWorkspaceStore = useWorkspace;
