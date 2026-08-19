import { create } from "zustand";
import type { MapScopeMode } from "../lib/mapScope";
import type { InquiryNode, NodeKind, Turn, WorkspaceSnapshot } from "../types";

export type WorkspaceMode = "focus" | "map";

const RECENT_MAX = 8;
export const UNREAD_RAIL_CAP = 12;

export interface WorkspaceState {
  nodes: InquiryNode[];
  turnsByCardId: Record<string, Turn[]>;
  focusId: string;
  source: WorkspaceSnapshot["source"] | null;
  /** focus = read card; map = full structure stage */
  workspaceMode: WorkspaceMode;
  /** Map structure slice mode */
  mapScopeMode: MapScopeMode;
  /** Most-recently focused card ids (newest first), excl. current optional */
  recentIds: string[];

  loadSnapshot: (snap: WorkspaceSnapshot) => void;
  focusNode: (id: string) => void;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  setMapScopeMode: (mode: MapScopeMode) => void;
  toggleMapMode: () => void;
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
  // dedupe while preserving order
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
  set: (partial: Partial<WorkspaceState> | ((s: WorkspaceState) => Partial<WorkspaceState>)) => void,
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

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  nodes: [],
  turnsByCardId: {},
  focusId: "",
  source: null,
  workspaceMode: "focus",
  mapScopeMode: "working",
  recentIds: [],

  loadSnapshot: (snap) => {
    idSeq = 0;
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
      workspaceMode: "focus",
      mapScopeMode: "working",
      recentIds: snap.focusId ? [snap.focusId] : [],
    });
  },

  focusNode: (id) => {
    const s0 = get();
    const idx = s0.nodes.findIndex((n) => n.id === id);
    if (idx < 0) return;
    const target = s0.nodes[idx]!;
    const nodes =
      target.unread === false
        ? s0.nodes
        : s0.nodes.map((n, i) =>
            i === idx ? { ...n, unread: false } : n,
          );
    set({
      focusId: id,
      recentIds: pushRecent(s0.recentIds, id, s0.focusId),
      nodes,
    });
  },

  setWorkspaceMode: (mode) => set({ workspaceMode: mode }),

  setMapScopeMode: (mode) => set({ mapScopeMode: mode }),

  toggleMapMode: () =>
    set((s) => ({
      workspaceMode: s.workspaceMode === "map" ? "focus" : "map",
    })),

  spawnDeepen: (sourceLabel) => {
    const prev = get().focusId;
    const id = spawnChild(get, set, "deepen", sourceLabel);
    set((s) => ({
      workspaceMode: "focus",
      recentIds: pushRecent(s.recentIds, id, prev),
    }));
    return id;
  },

  spawnDiverge: (sourceLabel) => {
    const prev = get().focusId;
    const id = spawnChild(get, set, "diverge", sourceLabel);
    set((s) => ({
      workspaceMode: "focus",
      recentIds: pushRecent(s.recentIds, id, prev),
    }));
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
    }));
  },
}));

/** Alias used by tests / plan docs; same store instance. */
export const useWorkspaceStore = useWorkspace;
