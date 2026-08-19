import { create } from "zustand";
import {
  completeResultToHtml,
  resolvePort,
  stripHtml,
  type ChatMessage,
} from "../lib/chat";
import { buildDeepenScope, inboundEdge } from "../lib/deepenScope";
import { getEnabledSkillsText } from "../lib/host";
import {
  LIVE_MAX,
  pinLiveId,
  touchSession,
  unpinLiveId,
} from "../lib/liveSet";
import type { MapScopeMode } from "../lib/mapScope";
import { rootOf, subtreeIds } from "../lib/threadDebt";
import type {
  Edge,
  InquiryNode,
  SourceSpan,
  Turn,
  WorkspaceSnapshot,
} from "../types";

/** Prepend enabled SKILL.md bodies as a system message when vault has skills. */
async function withSkillsSystem(
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  try {
    const text = (await getEnabledSkillsText()).trim();
    if (!text) return messages;
    return [{ role: "system", content: text }, ...messages];
  } catch {
    return messages;
  }
}

export type WorkspaceMode = "focus" | "map";

const RECENT_MAX = 8;
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

  loadSnapshot: (snap: WorkspaceSnapshot) => void;
  setVaultPath: (path: string | null) => void;
  focusNode: (id: string) => void;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  setMapScopeMode: (mode: MapScopeMode) => void;
  toggleMapMode: () => void;
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
  regenerateTurn: (turnId: string) => Promise<void>;
  deleteTurn: (turnId: string) => void;
  toggleTurnCollapsed: (turnId: string) => void;
  /** Fire-and-forget OK; returns when assistant turn is filled via ChatPort. */
  appendUserMessage: (text: string, quote?: string) => Promise<void>;
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

function cloneEdges(edges: Edge[] | undefined): Edge[] {
  return (edges ?? []).map((e) => ({
    ...e,
    source: { ...e.source },
  }));
}

/** Build chat messages from turns up to `untilIndex` (exclusive of assistant at until). */
function messagesFromTurns(
  turns: Turn[],
  opts?: { untilIndex?: number; includeAssistantAtUntil?: boolean },
): ChatMessage[] {
  const end = opts?.untilIndex ?? turns.length;
  const msgs: ChatMessage[] = [];
  for (let i = 0; i < end; i++) {
    const t = turns[i]!;
    if (t.user?.trim()) {
      msgs.push({ role: "user", content: t.user });
    }
    const includeAi =
      i < end - 1 || opts?.includeAssistantAtUntil === true;
    if (includeAi && t.aiHtml?.trim()) {
      const plain = stripHtml(t.aiHtml);
      if (plain) msgs.push({ role: "assistant", content: plain });
    }
  }
  return msgs;
}

function scopeForCard(
  s: Pick<WorkspaceState, "nodes" | "turnsByCardId" | "edges">,
  cardId: string,
): unknown {
  const edge = inboundEdge(cardId, s.edges);
  if (!edge || edge.kind !== "deepen") return undefined;
  return buildDeepenScope(cardId, edge.id, {
    nodes: s.nodes,
    turnsByCardId: s.turnsByCardId,
    edges: s.edges,
  });
}

function patchTurnAi(
  set: (
    partial:
      | Partial<WorkspaceState>
      | ((s: WorkspaceState) => Partial<WorkspaceState>),
  ) => void,
  cardId: string,
  turnId: string,
  patch: Partial<Pick<Turn, "aiHtml" | "think" | "thinkOpen">>,
) {
  set((s) => {
    const turns = s.turnsByCardId[cardId];
    if (!turns) return {};
    return {
      turnsByCardId: {
        ...s.turnsByCardId,
        [cardId]: turns.map((t) =>
          t.id === turnId ? { ...t, ...patch } : t,
        ),
      },
    };
  });
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

function applySpawnSuccess(
  get: () => WorkspaceState,
  set: (
    partial:
      | Partial<WorkspaceState>
      | ((s: WorkspaceState) => Partial<WorkspaceState>),
  ) => void,
  id: string,
  prevFocus: string,
) {
  const s = get();
  const root = rootOf(s.nodes, id);
  const { liveIds } = pinLiveId(s.liveIds, root?.id ?? id, LIVE_MAX);
  set({
    workspaceMode: "focus",
    recentIds: pushRecent(s.recentIds, id, prevFocus),
    sessionTouchIds: touchSession(s.sessionTouchIds, id),
    liveIds,
    highlightSpan: null,
  });
}

function memorySpawnInquiry(
  get: () => WorkspaceState,
  set: (
    partial:
      | Partial<WorkspaceState>
      | ((s: WorkspaceState) => Partial<WorkspaceState>),
  ) => void,
  input: SpawnInquiryInput,
): string {
  const s0 = get();
  const fromCardId = input.fromCardId ?? s0.focusId;
  if (!fromCardId || !s0.nodes.some((n) => n.id === fromCardId)) {
    return "";
  }

  const label = (input.source.text || "概念").slice(0, 48);
  const id = nextId(input.kind === "deepen" ? "d" : "v");
  const edgeId = nextId("e");
  const title =
    (input.kind === "deepen" ? "深挖 · " : "发散 · ") + label.slice(0, 12);

  const node: InquiryNode = {
    id,
    title,
    parentId: fromCardId,
    kind: input.kind,
    unread: true,
    status: "active",
  };

  const edge: Edge = {
    id: edgeId,
    kind: input.kind,
    fromCardId,
    toCardId: id,
    source: { ...input.source },
    why: input.why,
    actor: input.actor ?? "user",
  };

  // deepen: optional seed turn referencing span; diverge: empty turns
  let turns: Turn[] = [];
  if (input.kind === "deepen") {
    turns = [
      {
        id: nextId("t"),
        title: "深挖开场",
        collapsed: false,
        user: `从「${label}」往下：它具体指什么？`,
        think: "深挖：父状态 + 源跨度；不整段灌父 transcript。",
        thinkOpen: false,
        aiHtml: `这是对「${label}」的深挖卡。（demo 占位）`,
      },
    ];
  }

  const prevFocus = s0.focusId;
  set((s) => ({
    nodes: [...s.nodes, node],
    turnsByCardId: { ...s.turnsByCardId, [id]: turns },
    edges: [...s.edges, edge],
    focusId: id,
  }));
  applySpawnSuccess(get, set, id, prevFocus);
  return id;
}

function mergeHostSnapshot(
  get: () => WorkspaceState,
  set: (
    partial:
      | Partial<WorkspaceState>
      | ((s: WorkspaceState) => Partial<WorkspaceState>),
  ) => void,
  snap: WorkspaceSnapshot,
  preferredFocus: string,
) {
  const prev = get();
  const focusId = preferredFocus || snap.focusId;
  const focusNode = snap.nodes.find((n) => n.id === focusId);
  let rootId = focusId;
  if (focusNode?.parentId) {
    let cur: typeof focusNode | undefined = focusNode;
    const guard = new Set<string>();
    while (cur?.parentId && !guard.has(cur.id)) {
      guard.add(cur.id);
      cur = snap.nodes.find((n) => n.id === cur!.parentId);
    }
    if (cur) rootId = cur.id;
  }
  const { liveIds } = pinLiveId(prev.liveIds, rootId || focusId, LIVE_MAX);
  set({
    nodes: snap.nodes.map((n) => ({ ...n })),
    turnsByCardId: Object.fromEntries(
      Object.entries(snap.turnsByCardId).map(([k, turns]) => [
        k,
        turns.map((t) => ({ ...t })),
      ]),
    ),
    edges: cloneEdges(snap.edges),
    focusId,
    source: snap.source,
    workspaceMode: "focus",
    recentIds: pushRecent(prev.recentIds, focusId, prev.focusId),
    sessionTouchIds: touchSession(prev.sessionTouchIds, focusId),
    liveIds,
    highlightSpan: null,
  });
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
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

  setVaultPath: (path) => set({ vaultPath: path }),

  loadSnapshot: (snap) => {
    idSeq = 0;
    const prev = get();
    const prevFocus = prev.focusId;
    const keepMap = prev.workspaceMode === "map" && snap.source === "demo";
    const focusNode = snap.nodes.find((n) => n.id === snap.focusId);
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

  spawnInquiry: async (input) => {
    const s0 = get();
    const fromCardId = input.fromCardId ?? s0.focusId;
    if (!fromCardId) return "";

    // Universe path: Host is source of truth for ids + edges
    if (s0.source === "universe" && s0.vaultPath) {
      try {
        const { spawnInquiry: hostSpawn } = await import("../lib/host");
        const prevIds = new Set(s0.nodes.map((n) => n.id));
        const snap = await hostSpawn({
          kind: input.kind,
          fromCardId,
          source: input.source,
          why: input.why,
          actor: input.actor ?? "user",
        });
        const created =
          snap.nodes.find((n) => !prevIds.has(n.id))?.id ?? snap.focusId;
        mergeHostSnapshot(get, set, snap, created);
        return created;
      } catch {
        // fall through to in-memory spawn
      }
    }

    return memorySpawnInquiry(get, set, input);
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

  regenerateTurn: async (turnId) => {
    const s0 = get();
    let cardId = "";
    let turnIndex = -1;
    for (const [cid, turns] of Object.entries(s0.turnsByCardId)) {
      const idx = turns.findIndex((t) => t.id === turnId);
      if (idx >= 0) {
        cardId = cid;
        turnIndex = idx;
        break;
      }
    }
    if (!cardId || turnIndex < 0) return;

    const turns = s0.turnsByCardId[cardId] ?? [];
    const target = turns[turnIndex]!;
    const messages = messagesFromTurns(turns, {
      untilIndex: turnIndex + 1,
      includeAssistantAtUntil: false,
    });
    // Ensure the regenerated turn's user message is present.
    if (!messages.some((m) => m.role === "user" && m.content === target.user)) {
      if (target.user?.trim()) {
        messages.push({ role: "user", content: target.user });
      }
    }

    patchTurnAi(set, cardId, turnId, {
      think: "重生中…",
      thinkOpen: false,
    });

    try {
      const port = await resolvePort();
      const scope = scopeForCard(get(), cardId);
      const withSkills = await withSkillsSystem(messages);
      const result = await port.complete({
        cardId,
        messages: withSkills,
        scope,
      });
      // Mutate turn only — never spawn nodes on regenerate.
      patchTurnAi(set, cardId, turnId, {
        aiHtml: completeResultToHtml(result),
        think: result.marks?.length
          ? `marks: ${result.marks.map((m) => m.term).join(", ")}`
          : "",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      patchTurnAi(set, cardId, turnId, {
        aiHtml: `<p><em>重生失败：${msg.replace(/</g, "&lt;")}</em></p>`,
        think: "",
      });
    }
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

  appendUserMessage: async (text, quote) => {
    const focusId = get().focusId;
    if (!focusId || !text.trim()) return;
    const body = quote ? `> ${quote}\n\n${text}` : text;
    const turnId = nextId("t");
    const turn: Turn = {
      id: turnId,
      title: text.slice(0, 16) || "新消息",
      collapsed: false,
      user: body,
      think: "生成中…",
      thinkOpen: false,
      aiHtml: "",
    };
    set((s) => ({
      turnsByCardId: {
        ...s.turnsByCardId,
        [focusId]: [...(s.turnsByCardId[focusId] ?? []), turn],
      },
      sessionTouchIds: touchSession(s.sessionTouchIds, focusId),
    }));

    const s1 = get();
    const turns = s1.turnsByCardId[focusId] ?? [];
    const messages = messagesFromTurns(turns, {
      untilIndex: turns.length,
      includeAssistantAtUntil: false,
    });
    const scope = scopeForCard(s1, focusId);

    try {
      const port = await resolvePort();
      const withSkills = await withSkillsSystem(messages);
      const result = await port.complete({
        cardId: focusId,
        messages: withSkills,
        scope,
      });
      const aiHtml = completeResultToHtml(result);
      patchTurnAi(set, focusId, turnId, {
        aiHtml,
        think: result.marks?.length
          ? `marks: ${result.marks.map((m) => m.term).join(", ")}`
          : "",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      patchTurnAi(set, focusId, turnId, {
        aiHtml: `<p><em>回复失败：${msg.replace(/</g, "&lt;")}</em></p>`,
        think: "",
      });
    }
  },
}));

export const useWorkspaceStore = useWorkspace;
