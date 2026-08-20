import type { InquiryNode } from "../types";
import { rootOf } from "./threadDebt";

export type OrbitKind = "root" | "deepen" | "diverge";

export interface OrbitItem {
  id: string;
  title: string;
  kind: OrbitKind;
  unread: boolean;
  /** 0 = center, 1 = inner ring, 2 = outer … */
  ring: number;
  parentId: string | null;
}

export interface OrbitModel {
  center: OrbitItem | null;
  /** rings[0] unused or empty; rings[1] = children of center; rings[2] = children of focus if deeper */
  rings: OrbitItem[][];
  focusId: string;
  rootId: string | null;
}

export interface BuildOrbitOptions {
  /** max items per ring (default 7) */
  ringCap?: number;
  /** max ring depth beyond center (default 2 → rings 1..2) */
  maxRing?: number;
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

/** Build orbit centered on live/root of focus; outer ring follows focus when focus ≠ root. */
export function buildOrbitModel(
  nodes: InquiryNode[],
  focusId: string,
  opts?: BuildOrbitOptions,
): OrbitModel {
  const ringCap = opts?.ringCap ?? 7;
  const maxRing = opts?.maxRing ?? 2;

  const root = rootOf(nodes, focusId);
  const center = root ? toItem(root, 0) : null;
  const rootId = root?.id ?? null;

  const rings: OrbitItem[][] = Array.from({ length: maxRing + 1 }, () => []);

  if (!root || maxRing < 1) {
    return { center, rings, focusId, rootId };
  }

  rings[1] = childrenOf(nodes, root.id)
    .slice(0, ringCap)
    .map((n) => toItem(n, 1));

  if (maxRing >= 2 && focusId !== root.id) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    if (byId.has(focusId)) {
      rings[2] = childrenOf(nodes, focusId)
        .slice(0, ringCap)
        .map((n) => toItem(n, 2));
    }
  }

  return { center, rings, focusId, rootId };
}
