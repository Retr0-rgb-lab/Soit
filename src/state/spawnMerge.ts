import {
  LIVE_MAX,
  pinLiveId,
  touchSession,
} from "../lib/liveSet";
import { rootOf } from "../lib/threadDebt";
import {
  collectSubtreeIds,
  nextFocusAfterDelete,
} from "../lib/treeNav";
import type {
  Edge,
  InquiryNode,
  Turn,
  WorkspaceSnapshot,
} from "../types";
import {
  nextId,
  type StoreGet,
  type StoreSet,
} from "./turnHelpers";
import type { SpawnInquiryInput, WorkspaceState } from "./workspaceStore";
import { reduceDocSession } from "../lib/docSession";

const RECENT_MAX = 8;

export function pushRecent(
  recentIds: string[],
  id: string,
  prevFocus: string,
): string[] {
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

export function cloneEdges(edges: Edge[] | undefined): Edge[] {
  return (edges ?? []).map((e) => ({
    ...e,
    source: { ...e.source },
  }));
}

export function afterFocus(
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

export function applySpawnSuccess(
  get: StoreGet,
  set: StoreSet,
  id: string,
  prevFocus: string,
): void {
  const s = get();
  const focused = afterFocus({ ...s, focusId: prevFocus }, id);
  set({
    ...focused,
    workspaceMode: "focus",
    highlightSpan: null,
  });
}

/** Demo / unbound memory spawn — never used when source === "universe". */
export function memorySpawnInquiry(
  get: StoreGet,
  set: StoreSet,
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
    // Spawn focuses the child immediately — treat as already opened.
    unread: false,
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

/**
 * Full-replace merge from Host snapshot.
 * Safe after write-through: universe turns already live on Host.
 */
export function mergeHostSnapshot(
  get: StoreGet,
  set: StoreSet,
  snap: WorkspaceSnapshot,
  preferredFocus: string,
): void {
  const prev = get();
  const nodeIds = new Set(snap.nodes.map((n) => n.id));
  const want = preferredFocus || snap.focusId;
  const focusId = nodeIds.has(want)
    ? want
    : nodeIds.has(snap.focusId)
      ? snap.focusId
      : (snap.nodes.find((n) => !n.parentId)?.id ??
        snap.nodes[0]?.id ??
        "");
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
  const prunedLive = prev.liveIds.filter((id) => nodeIds.has(id));
  const { liveIds } =
    focusId.length > 0
      ? pinLiveId(prunedLive, rootId || focusId, LIVE_MAX)
      : { liveIds: [] as string[] };
  // Host may leave newly focused child unread; clear like focusNode would.
  const nodes = snap.nodes.map((n) =>
    n.id === focusId && n.unread ? { ...n, unread: false } : { ...n },
  );
  set({
    nodes,
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
    recentIds:
      focusId.length > 0
        ? pushRecent(prev.recentIds, focusId, prev.focusId)
        : [],
    sessionTouchIds:
      focusId.length > 0
        ? touchSession(prev.sessionTouchIds, focusId)
        : [],
    liveIds,
    highlightSpan: null,
  });
}

/**
 * Demo / unbound memory delete — never used when source === "universe".
 * Cascade subtree; returns next focus id (may be "").
 */
export function memoryDeleteInquiry(
  get: StoreGet,
  set: StoreSet,
  cardId: string,
): string {
  const s0 = get();
  const deleteIds = collectSubtreeIds(s0.nodes, cardId);
  if (deleteIds.size === 0) return s0.focusId;

  const nextFocus = nextFocusAfterDelete(
    s0.nodes,
    deleteIds,
    s0.focusId,
    cardId,
  );

  const nodes = s0.nodes.filter((n) => !deleteIds.has(n.id));
  const edges = s0.edges.filter(
    (e) => !deleteIds.has(e.fromCardId) && !deleteIds.has(e.toCardId),
  );
  const turnsByCardId = { ...s0.turnsByCardId };
  for (const id of deleteIds) {
    delete turnsByCardId[id];
  }

  let docSession = s0.docSession;
  if (
    docSession.boundCardId &&
    deleteIds.has(docSession.boundCardId)
  ) {
    docSession = reduceDocSession(docSession, { type: "force_close" });
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const prunedLive = s0.liveIds.filter((id) => nodeIds.has(id));
  const root = nextFocus ? rootOf(nodes, nextFocus) : null;
  const { liveIds } =
    nextFocus.length > 0
      ? pinLiveId(prunedLive, root?.id ?? nextFocus, LIVE_MAX)
      : { liveIds: [] as string[] };

  set({
    nodes,
    edges,
    turnsByCardId,
    focusId: nextFocus,
    recentIds: s0.recentIds.filter((id) => nodeIds.has(id)),
    sessionTouchIds: s0.sessionTouchIds.filter((id) => nodeIds.has(id)),
    liveIds,
    highlightSpan: null,
    docSession,
    workspaceMode: "focus",
  });

  return nextFocus;
}

/** Fire-and-forget Host unread clear (universe path). */
export function hostClearUnread(cardIds: string[]): void {
  if (cardIds.length === 0) return;
  void import("../lib/host")
    .then(({ updateCard }) =>
      Promise.all(
        cardIds.map((cardId) =>
          updateCard({ cardId, unread: false }).catch((err) => {
            console.error("[soit] update_card unread failed", cardId, err);
          }),
        ),
      ),
    )
    .catch((err) => {
      console.error("[soit] update_card import failed", err);
    });
}
