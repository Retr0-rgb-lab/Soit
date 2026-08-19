import type { InquiryNode } from "../types";

/** Node with SVG coordinates in viewBox 0..200 × 0..300. */
export type LaidOutNode = InquiryNode & { x: number; y: number };

/**
 * Stable tree layout (prototype-compatible): leaves spaced on x,
 * parents centered over children; y by depth from roots.
 */
export function layoutGraph(nodes: InquiryNode[]): LaidOutNode[] {
  if (nodes.length === 0) return [];

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const byParent = new Map<string, InquiryNode[]>();
  for (const n of nodes) {
    const k = n.parentId ?? "__root__";
    const list = byParent.get(k);
    if (list) list.push(n);
    else byParent.set(k, [n]);
  }

  const roots = nodes.filter((n) => !n.parentId || !byId.has(n.parentId));

  const depthOf = (n: InquiryNode, guard = 0): number => {
    if (!n.parentId || !byId.has(n.parentId) || guard > 20) return 0;
    const p = byId.get(n.parentId)!;
    return 1 + depthOf(p, guard + 1);
  };

  const leafIndex = new Map<string, number>();
  const leaves: InquiryNode[] = [];
  const walk = (n: InquiryNode) => {
    const kids = byParent.get(n.id) ?? [];
    if (!kids.length) leaves.push(n);
    else kids.forEach(walk);
  };
  roots.forEach(walk);
  leaves.forEach((n, i) => leafIndex.set(n.id, i));

  const lx = new Map<string, number>();
  const assign = (n: InquiryNode): number => {
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
