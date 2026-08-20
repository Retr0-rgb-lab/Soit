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

/** Children of parentId, kind-stable sort: deepen first then diverge then id */
export function childrenOf(
  nodes: InquiryNode[],
  parentId: string,
): InquiryNode[] {
  const rank = (k: InquiryNode["kind"]) =>
    k === "deepen" ? 0 : k === "diverge" ? 1 : 2;
  return nodes
    .filter((n) => n.parentId === parentId)
    .slice()
    .sort((a, b) => {
      const dr = rank(a.kind) - rank(b.kind);
      if (dr !== 0) return dr;
      return a.id.localeCompare(b.id);
    });
}

/** Build orbit centered on live/root of focus; outer ring follows focus when focus ≠ root. */
export function buildOrbitModel(
  nodes: InquiryNode[],
  focusId: string,
  opts: BuildOrbitOptions = {},
): OrbitModel {
  const ringCap = opts.ringCap ?? 7;
  const maxRing = opts.maxRing ?? 2;

  const empty: OrbitModel = {
    center: null,
    rings: [[], [], []],
    focusId,
    rootId: null,
  };

  if (!focusId || nodes.length === 0) return empty;

  const centerNode = rootOf(nodes, focusId);
  if (!centerNode) {
    const self = nodes.find((n) => n.id === focusId);
    if (!self) return empty;
    return {
      center: toItem(self, 0),
      rings: [[], [], []],
      focusId,
      rootId: self.id,
    };
  }

  const rings: OrbitItem[][] = [[], [], []];
  if (maxRing >= 1) {
    rings[1] = childrenOf(nodes, centerNode.id)
      .slice(0, ringCap)
      .map((n) => toItem(n, 1));
  }
  if (maxRing >= 2 && focusId !== centerNode.id) {
    rings[2] = childrenOf(nodes, focusId)
      .slice(0, ringCap)
      .map((n) => toItem(n, 2));
  }

  return {
    center: toItem(centerNode, 0),
    rings,
    focusId,
    rootId: centerNode.id,
  };
}
