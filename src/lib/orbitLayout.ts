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

function kindRank(kind: InquiryNode["kind"]): number {
  if (kind === "deepen") return 0;
  if (kind === "diverge") return 1;
  return 2;
}

/** Children of parentId, kind-stable sort: deepen first then diverge then id */
export function childrenOf(nodes: InquiryNode[], parentId: string): InquiryNode[] {
  return nodes
    .filter((n) => n.parentId === parentId)
    .slice()
    .sort((a, b) => {
      const kr = kindRank(a.kind) - kindRank(b.kind);
      if (kr !== 0) return kr;
      return a.id.localeCompare(b.id);
    });
}

function isDescendantOf(
  nodes: InquiryNode[],
  nodeId: string,
  ancestorId: string,
): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let cur = byId.get(nodeId);
  const guard = new Set<string>();
  while (cur?.parentId) {
    if (guard.has(cur.id)) break;
    guard.add(cur.id);
    if (cur.parentId === ancestorId) return true;
    cur = byId.get(cur.parentId);
  }
  return false;
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

  const rings: OrbitItem[][] = [[]];

  if (!center || maxRing < 1) {
    return { center, rings, focusId, rootId };
  }

  const ring1 = childrenOf(nodes, center.id)
    .slice(0, ringCap)
    .map((n) => toItem(n, 1));
  rings[1] = ring1;

  if (maxRing >= 2) {
    const focusIsDeeper =
      Boolean(focusId) &&
      focusId !== center.id &&
      isDescendantOf(nodes, focusId, center.id);
    rings[2] = focusIsDeeper
      ? childrenOf(nodes, focusId)
          .slice(0, ringCap)
          .map((n) => toItem(n, 2))
      : [];
  }

  return { center, rings, focusId, rootId };
}
