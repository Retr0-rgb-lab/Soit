import type { InquiryNode } from "../types";

export const LAYOUT_DEPTH_MAX = 256;

/** Node with SVG coordinates in viewBox 0..200 × 0..300. Extra fields preserved. */
export type LaidOutNode<T extends InquiryNode = InquiryNode> = T & {
  x: number;
  y: number;
};

/**
 * Stable tree layout (prototype-compatible): leaves spaced on x,
 * parents centered over children; y by depth from roots.
 * Accepts subsets / forests; preserves unknown fields (e.g. role).
 */
export function layoutGraph<T extends InquiryNode>(nodes: T[]): LaidOutNode<T>[] {
  if (nodes.length === 0) return [];

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const byParent = new Map<string, T[]>();
  for (const n of nodes) {
    const k = n.parentId ?? "__root__";
    const list = byParent.get(k);
    if (list) list.push(n);
    else byParent.set(k, [n]);
  }

  const roots = nodes.filter((n) => !n.parentId || !byId.has(n.parentId));

  const depthOf = (n: InquiryNode): number => {
    let d = 0;
    let cur: InquiryNode | undefined = n;
    const guard = new Set<string>();
    while (
      cur?.parentId &&
      byId.has(cur.parentId) &&
      !guard.has(cur.id) &&
      d < LAYOUT_DEPTH_MAX
    ) {
      guard.add(cur.id);
      cur = byId.get(cur.parentId);
      d += 1;
    }
    return d;
  };

  const leafIndex = new Map<string, number>();
  const leaves: T[] = [];
  const walk = (n: T) => {
    const kids = byParent.get(n.id) ?? [];
    if (!kids.length) leaves.push(n);
    else kids.forEach(walk);
  };
  roots.forEach(walk);
  leaves.forEach((n, i) => leafIndex.set(n.id, i));

  const lx = new Map<string, number>();
  const assign = (n: T): number => {
    const kids = byParent.get(n.id) ?? [];
    if (!kids.length) {
      const v = leafIndex.get(n.id) ?? 0;
      lx.set(n.id, v);
      return v;
    }
    let sum = 0;
    for (const k of kids) sum += assign(k);
    const v = sum / kids.length;
    lx.set(n.id, v);
    return v;
  };
  roots.forEach(assign);

  // Orphans / disconnected nodes not reached from roots
  for (const n of nodes) {
    if (!lx.has(n.id)) {
      const v = leaves.length;
      leaves.push(n);
      leafIndex.set(n.id, v);
      lx.set(n.id, v);
    }
  }

  const maxL = Math.max(1, leaves.length - 1);
  const maxD = Math.max(1, ...nodes.map((n) => depthOf(n)));

  return nodes.map((n) => {
    const d = depthOf(n);
    const x = 28 + ((lx.get(n.id) ?? 0) / maxL) * 144;
    const y = 36 + (d / maxD) * 220;
    return { ...n, x, y };
  });
}
