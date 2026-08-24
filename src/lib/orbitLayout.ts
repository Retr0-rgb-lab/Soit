import type { InquiryNode } from "../types";
import { rootOf } from "./threadDebt";

export type OrbitKind = "root" | "deepen" | "diverge";

export interface OrbitItem {
  id: string;
  title: string;
  kind: OrbitKind;
  unread: boolean;
  /** Tree depth from local root (0 = root). */
  ring: number;
  parentId: string | null;
}

/** Stable world position — never jumps when focus changes. */
export type OrbitWorldNode = OrbitItem & {
  x: number;
  y: number;
  depth: number;
};

export type OrbitEdge = {
  fromId: string;
  toId: string;
};

/**
 * Focus-local cone membership (what to emphasize), plus stable world layout.
 *
 * · World coords are fixed from the true root — **camera** moves, graph does not.
 * · Radial distance = depth; siblings share a ring (发散同层).
 * · Cone: ancestors + siblings + children of focus (Explore neighborhood).
 */
export interface OrbitModel {
  hub: OrbitItem | null;
  center: OrbitItem | null;
  hubIsFocus: boolean;
  focusId: string;
  rootId: string | null;
  rings: OrbitItem[][];
  layer: OrbitItem[];
  children: OrbitItem[];
  /** All nodes in the root tree with stable x/y */
  world: OrbitWorldNode[];
  /** Parent→child edges in world */
  edges: OrbitEdge[];
  /** Ids in the local cone (bright); others dim if drawn */
  coneIds: string[];
}

export interface BuildOrbitOptions {
  ringCap?: number;
  /** World units between depth rings (default 64) */
  ringGap?: number;
}

const KIND_ORDER: Record<OrbitKind, number> = {
  deepen: 0,
  diverge: 1,
  root: 2,
};

function toItem(n: InquiryNode, ring: number): OrbitItem {
  return {
    id: n.id,
    title: n.title,
    kind: n.kind,
    unread: n.unread,
    ring,
    parentId: n.parentId,
  };
}

/** Children of parentId, kind-stable sort: deepen first then diverge then id */
export function childrenOf(nodes: InquiryNode[], parentId: string): InquiryNode[] {
  return nodes
    .filter((n) => n.parentId === parentId)
    .slice()
    .sort((a, b) => {
      const ka = KIND_ORDER[a.kind] ?? 9;
      const kb = KIND_ORDER[b.kind] ?? 9;
      if (ka !== kb) return ka - kb;
      return a.id.localeCompare(b.id);
    });
}

/**
 * Stable radial layout from tree root(s).
 * Root at origin; depth → radius; siblings share a ring (same layer).
 * Coordinates do not depend on focusId.
 */
export function layoutOrbitWorld(
  nodes: InquiryNode[],
  rootId: string | null,
  ringGap = 78,
): { world: OrbitWorldNode[]; edges: OrbitEdge[] } {
  if (!rootId || !nodes.length) return { world: [], edges: [] };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (!byId.has(rootId)) return { world: [], edges: [] };

  const pos = new Map<string, { x: number; y: number; depth: number }>();
  const edges: OrbitEdge[] = [];

  /** Place node at angle `mid`; children fan tightly around the same heading. */
  const place = (id: string, depth: number, mid: number): void => {
    const n = byId.get(id);
    if (!n) return;
    const r = depth * ringGap;
    const x = depth === 0 ? 0 : r * Math.cos(mid);
    const y = depth === 0 ? 0 : r * Math.sin(mid);
    pos.set(id, { x, y, depth });

    const kids = childrenOf(nodes, id);
    if (!kids.length) return;

    // Same-layer fan: ~40° between siblings, centered on parent heading
    const step = (Math.PI / 180) * 40;
    const spread = kids.length <= 1 ? 0 : step * (kids.length - 1);
    const start = mid - spread / 2;

    kids.forEach((k, i) => {
      edges.push({ fromId: id, toId: k.id });
      const ang = kids.length === 1 ? mid : start + i * step;
      place(k.id, depth + 1, ang);
    });
  };

  // Root opens upward (−π/2)
  place(rootId, 0, -Math.PI / 2);

  const world: OrbitWorldNode[] = [];
  for (const n of nodes) {
    const p = pos.get(n.id);
    if (!p) continue;
    world.push({
      ...toItem(n, p.depth),
      x: p.x,
      y: p.y,
      depth: p.depth,
    });
  }
  return { world, edges };
}

/** Explore-style neighborhood ids around focus. */
export function orbitConeIds(nodes: InquiryNode[], focusId: string): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const focus = byId.get(focusId);
  if (!focus) return [];
  const ids = new Set<string>([focus.id]);

  // ancestors
  let cur: InquiryNode | undefined = focus;
  const guard = new Set<string>();
  while (cur?.parentId && byId.has(cur.parentId) && !guard.has(cur.id)) {
    guard.add(cur.id);
    ids.add(cur.parentId);
    cur = byId.get(cur.parentId);
  }

  // siblings (same layer)
  if (focus.parentId) {
    for (const n of childrenOf(nodes, focus.parentId)) ids.add(n.id);
  }

  // children (deeper)
  for (const n of childrenOf(nodes, focus.id)) ids.add(n.id);

  return [...ids];
}

/**
 * Build orbit model: stable world + cone membership + legacy ring fields.
 */
export function buildOrbitModel(
  nodes: InquiryNode[],
  focusId: string,
  opts?: BuildOrbitOptions,
): OrbitModel {
  const ringCap = opts?.ringCap ?? 7;
  const ringGap = opts?.ringGap ?? 56;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const focus = byId.get(focusId);
  const emptyRings: OrbitItem[][] = [[], [], []];

  if (!focus) {
    return {
      hub: null,
      center: null,
      hubIsFocus: false,
      focusId,
      rootId: null,
      rings: emptyRings,
      layer: [],
      children: [],
      world: [],
      edges: [],
      coneIds: [],
    };
  }

  const root = rootOf(nodes, focusId);
  const rootId = root?.id ?? null;
  const { world, edges } = layoutOrbitWorld(nodes, rootId, ringGap);
  const coneIds = orbitConeIds(nodes, focusId);

  const parent =
    focus.parentId && byId.has(focus.parentId)
      ? byId.get(focus.parentId)!
      : null;
  const hubNode = parent ?? focus;
  const hubIsFocus = hubNode.id === focus.id;
  const hub = toItem(hubNode, parent ? 0 : 0);

  const rings: OrbitItem[][] = [[], [], []];
  if (hubIsFocus) {
    rings[1] = childrenOf(nodes, focus.id)
      .slice(0, ringCap)
      .map((n) => toItem(n, 1));
  } else {
    rings[1] = childrenOf(nodes, hubNode.id)
      .slice(0, ringCap)
      .map((n) => toItem(n, 1));
    rings[2] = childrenOf(nodes, focus.id)
      .slice(0, ringCap)
      .map((n) => toItem(n, 2));
  }

  return {
    hub,
    center: hub,
    hubIsFocus,
    focusId,
    rootId,
    rings,
    layer: rings[1],
    children: rings[2],
    world,
    edges,
    coneIds,
  };
}
