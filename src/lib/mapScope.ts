import type { InquiryNode, NodeKind } from "../types";
import { ancestorChain } from "./treeNav";

export type MapScopeMode = "cone" | "working" | "atlas" | "growth";
export type NodeRole = "focus" | "path" | "context" | "field" | "aggregate";

export type MapNodeView = InquiryNode & {
  role: NodeRole;
  aggregateCount?: number;
  representsIds?: string[];
};

export type MapCaps = {
  siblingCap: number;
  childCap: number;
  hardCap: number;
  unreadMapCap: number;
};

/** groupKey e.g. `${parentId}:child` | `${parentId}:sibling` → visible count override */
export type ExpandedCaps = Record<string, number>;

export const DEFAULT_MAP_CAPS: MapCaps = {
  siblingCap: 12,
  childCap: 12,
  hardCap: 80,
  unreadMapCap: 12,
};

export const EXPAND_STEP = 12;
export const RECENT_MAP_MAX = 8;

function majorityKind(nodes: InquiryNode[]): NodeKind {
  const counts: Record<NodeKind, number> = {
    root: 0,
    deepen: 0,
    diverge: 0,
  };
  for (const n of nodes) counts[n.kind] += 1;
  // prefer diverge on tie (spec)
  let best: NodeKind = "diverge";
  let bestN = -1;
  for (const k of ["diverge", "deepen", "root"] as NodeKind[]) {
    if (counts[k] > bestN) {
      bestN = counts[k];
      best = k;
    }
  }
  return best;
}

function kindLabel(k: NodeKind): string {
  if (k === "diverge") return "发散";
  if (k === "deepen") return "深挖";
  return "节点";
}

function aggId(parentId: string, group: "child" | "sibling"): string {
  return `agg:${parentId}:${group}`;
}

function cloneAs(
  n: InquiryNode,
  role: NodeRole,
): MapNodeView {
  return { ...n, role };
}

function effectiveCap(
  base: number,
  key: string,
  expanded?: ExpandedCaps,
): number {
  const bump = expanded?.[key];
  return bump != null ? Math.max(base, bump) : base;
}

/**
 * Focus cone: FULL ancestor chain + capped siblings/children + aggregates.
 */
export function mapConeNodes(
  nodes: InquiryNode[],
  focusId: string,
  caps: MapCaps = DEFAULT_MAP_CAPS,
  expanded?: ExpandedCaps,
): MapNodeView[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const focus = byId.get(focusId);
  if (!focus) return [];

  const path = ancestorChain(nodes, focusId);
  const pathIds = new Set(path.map((n) => n.id));
  const views = new Map<string, MapNodeView>();

  for (const n of path) {
    views.set(n.id, cloneAs(n, n.id === focusId ? "focus" : "path"));
  }

  // siblings (same parent), include focus
  if (focus.parentId && byId.has(focus.parentId)) {
    const parentId = focus.parentId;
    const sibs = nodes
      .filter((n) => n.parentId === parentId)
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title, "zh"));
    const key = `${parentId}:sibling`;
    const limit = effectiveCap(caps.siblingCap, key, expanded);
    const visible = pickPreferring(sibs, focusId, limit);
    const hidden = sibs.filter((n) => !visible.some((v) => v.id === n.id));
    for (const n of visible) {
      if (!views.has(n.id)) views.set(n.id, cloneAs(n, "context"));
    }
    if (hidden.length > 0) {
      const id = aggId(parentId, "sibling");
      const k = majorityKind(hidden);
      views.set(id, {
        id,
        title: `+${hidden.length} ${kindLabel(k)}`,
        parentId,
        kind: k,
        unread: hidden.some((h) => h.unread),
        role: "aggregate",
        aggregateCount: hidden.length,
        representsIds: hidden.map((h) => h.id),
      });
    }
  }

  // children of focus (prefer unread under cap, same as siblings)
  {
    const kids = nodes
      .filter((n) => n.parentId === focusId)
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title, "zh"));
    const key = `${focusId}:child`;
    const limit = effectiveCap(caps.childCap, key, expanded);
    const visible = pickPreferring(kids, focusId, limit);
    const visibleIds = new Set(visible.map((n) => n.id));
    const hidden = kids.filter((n) => !visibleIds.has(n.id));
    for (const n of visible) {
      if (!views.has(n.id)) views.set(n.id, cloneAs(n, "context"));
    }
    if (hidden.length > 0) {
      const id = aggId(focusId, "child");
      const k = majorityKind(hidden);
      views.set(id, {
        id,
        title: `+${hidden.length} ${kindLabel(k)}`,
        parentId: focusId,
        kind: k,
        unread: hidden.some((h) => h.unread),
        role: "aggregate",
        aggregateCount: hidden.length,
        representsIds: hidden.map((h) => h.id),
      });
    }
  }

  // ensure path ids still marked correctly if overwritten
  for (const id of pathIds) {
    const v = views.get(id);
    if (!v) continue;
    if (id === focusId) v.role = "focus";
    else if (v.role !== "aggregate") v.role = "path";
  }

  return [...views.values()];
}

/** Prefer focus first, then unread, then title order — take `limit`. */
function pickPreferring(
  list: InquiryNode[],
  focusId: string,
  limit: number,
): InquiryNode[] {
  if (list.length <= limit) return list;
  const focus = list.find((n) => n.id === focusId);
  const rest = list
    .filter((n) => n.id !== focusId)
    .sort((a, b) => {
      if (a.unread !== b.unread) return a.unread ? -1 : 1;
      return a.title.localeCompare(b.title, "zh");
    });
  const out: InquiryNode[] = [];
  if (focus) out.push(focus);
  for (const n of rest) {
    if (out.length >= limit) break;
    out.push(n);
  }
  return out;
}

/**
 * Working set: cone + recent + unread, then hard clamp.
 */
export function mapWorkingNodes(
  nodes: InquiryNode[],
  focusId: string,
  recentIds: string[],
  caps: MapCaps = DEFAULT_MAP_CAPS,
  expanded?: ExpandedCaps,
): MapNodeView[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const base = mapConeNodes(nodes, focusId, caps, expanded);
  const views = new Map(base.map((v) => [v.id, v]));

  let recentAdded = 0;
  for (const id of recentIds) {
    if (recentAdded >= RECENT_MAP_MAX) break;
    if (views.has(id)) continue;
    const n = byId.get(id);
    if (!n) continue;
    views.set(id, cloneAs(n, "field"));
    recentAdded += 1;
  }

  const unreadList = nodes
    .filter((n) => n.unread && n.id !== focusId)
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title, "zh"));
  let unreadAdded = 0;
  for (const n of unreadList) {
    if (unreadAdded >= caps.unreadMapCap) break;
    if (views.has(n.id)) continue;
    views.set(n.id, cloneAs(n, "field"));
    unreadAdded += 1;
  }

  // Re-assert path/focus roles
  const path = ancestorChain(nodes, focusId);
  for (const n of path) {
    const v = views.get(n.id);
    if (!v || v.role === "aggregate") continue;
    v.role = n.id === focusId ? "focus" : "path";
  }

  return hardClamp([...views.values()], focusId, path.map((p) => p.id), caps.hardCap);
}

function hardClamp(
  views: MapNodeView[],
  focusId: string,
  pathIds: string[],
  hardCap: number,
): MapNodeView[] {
  if (views.length <= hardCap) return views;
  const pathSet = new Set(pathIds);
  const protectedIds = new Set<string>([focusId, ...pathIds]);
  // protect parents of aggregates still needed
  for (const v of views) {
    if (v.role === "aggregate" && v.parentId) protectedIds.add(v.parentId);
  }

  const droppable = (role: NodeRole) =>
    views
      .filter((v) => v.role === role && !protectedIds.has(v.id))
      .sort((a, b) => a.title.localeCompare(b.title, "zh"));

  let list = [...views];
  const dropRoles: NodeRole[] = ["field", "context"];
  for (const role of dropRoles) {
    if (list.length <= hardCap) break;
    const victims = droppable(role);
    for (const vic of victims) {
      if (list.length <= hardCap) break;
      list = list.filter((v) => v.id !== vic.id);
    }
  }

  // last resort: drop unprotected aggregates
  if (list.length > hardCap) {
    const aggs = list
      .filter((v) => v.role === "aggregate" && !pathSet.has(v.id))
      .sort((a, b) => (b.aggregateCount ?? 0) - (a.aggregateCount ?? 0));
    for (const a of aggs) {
      if (list.length <= hardCap) break;
      // keep at least one? drop largest first if still over
      list = list.filter((v) => v.id !== a.id);
    }
  }

  // Never slice away focus/path. If path alone exceeds hardCap, keep protected set.
  if (list.length <= hardCap) return list;
  const protectedList: MapNodeView[] = [];
  const rest: MapNodeView[] = [];
  for (const v of list) {
    if (protectedIds.has(v.id)) protectedList.push(v);
    else rest.push(v);
  }
  // Prefer focus first, then path order, then remaining protected.
  const pathOrder = new Map(pathIds.map((id, i) => [id, i]));
  protectedList.sort((a, b) => {
    if (a.id === focusId) return -1;
    if (b.id === focusId) return 1;
    const pa = pathOrder.has(a.id) ? pathOrder.get(a.id)! : 9999;
    const pb = pathOrder.has(b.id) ? pathOrder.get(b.id)! : 9999;
    if (pa !== pb) return pa - pb;
    return a.title.localeCompare(b.title, "zh");
  });
  if (protectedList.length >= hardCap) {
    return protectedList.slice(0, Math.max(hardCap, pathIds.length));
  }
  const room = hardCap - protectedList.length;
  return [...protectedList, ...rest.slice(0, room)];
}

/**
 * Today's growth / session touches: cone + sessionTouchIds as field.
 */
export function mapGrowthNodes(
  nodes: InquiryNode[],
  focusId: string,
  sessionTouchIds: string[],
  caps: MapCaps = DEFAULT_MAP_CAPS,
  expanded?: ExpandedCaps,
): MapNodeView[] {
  // Reuse working builder with session touches as "recent"
  return mapWorkingNodes(nodes, focusId, sessionTouchIds, caps, expanded);
}

/**
 * Atlas: roots + one branch proxy per root; promote focus path.
 */
export function mapAtlasNodes(
  nodes: InquiryNode[],
  focusId: string,
  _caps: MapCaps = DEFAULT_MAP_CAPS,
): MapNodeView[] {
  const roots = nodes.filter((n) => !n.parentId);
  const views = new Map<string, MapNodeView>();

  for (const r of roots) {
    views.set(r.id, cloneAs(r, "context"));
    const descendants = nodes.filter(
      (n) => n.id !== r.id && isUnder(nodes, n.id, r.id),
    );
    if (descendants.length === 0) continue;
    const id = aggId(r.id, "child");
    const k = majorityKind(descendants);
    views.set(id, {
      id,
      title: `+${descendants.length} ${kindLabel(k)}`,
      parentId: r.id,
      kind: k,
      unread: descendants.some((d) => d.unread),
      role: "aggregate",
      aggregateCount: descendants.length,
      representsIds: descendants.map((d) => d.id),
    });
  }

  const path = ancestorChain(nodes, focusId);
  for (const n of path) {
    // remove from any aggregate represents if present
    for (const v of views.values()) {
      if (v.role === "aggregate" && v.representsIds?.includes(n.id)) {
        v.representsIds = v.representsIds.filter((x) => x !== n.id);
        v.aggregateCount = v.representsIds.length;
        v.title = `+${v.aggregateCount} ${kindLabel(v.kind)}`;
        v.unread = false; // simplified; recompute if needed
      }
    }
    views.set(
      n.id,
      cloneAs(n, n.id === focusId ? "focus" : "path"),
    );
  }

  // drop empty aggregates
  for (const [id, v] of [...views.entries()]) {
    if (v.role === "aggregate" && (v.aggregateCount ?? 0) <= 0) {
      views.delete(id);
    }
  }

  return [...views.values()];
}

function isUnder(
  nodes: InquiryNode[],
  nodeId: string,
  rootId: string,
): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let cur = byId.get(nodeId);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    if (cur.id === rootId) return true;
    guard.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

export function isAggregateId(id: string): boolean {
  return id.startsWith("agg:");
}

export function parseAggregateKey(
  id: string,
): { parentId: string; group: "child" | "sibling" } | null {
  if (!id.startsWith("agg:")) return null;
  const rest = id.slice(4);
  const idx = rest.lastIndexOf(":");
  if (idx < 0) return null;
  const parentId = rest.slice(0, idx);
  const group = rest.slice(idx + 1);
  if (group !== "child" && group !== "sibling") return null;
  return { parentId, group };
}
