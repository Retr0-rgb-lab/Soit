import type { InquiryNode } from "../types";

export const LAYOUT_DEPTH_MAX = 256;

/** Node with SVG coordinates. Extra fields preserved. */
export type LaidOutNode<T extends InquiryNode = InquiryNode> = T & {
  x: number;
  y: number;
};

export type LayoutBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

/**
 * Stable tree layout: leaves spaced on x, parents centered; y by depth.
 * Coordinate space grows with depth/width (no longer locked to 200×300 content).
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

  for (const n of nodes) {
    if (!lx.has(n.id)) {
      const v = leaves.length;
      leaves.push(n);
      leafIndex.set(n.id, v);
      lx.set(n.id, v);
    }
  }

  const leafCount = Math.max(1, leaves.length);
  const maxD = Math.max(1, ...nodes.map((n) => depthOf(n)));
  // Dynamic span: ~36px per leaf column, ~48px per depth
  const xSpan = Math.max(144, (leafCount - 1) * 36);
  const ySpan = Math.max(220, maxD * 48);
  const padX = 40;
  const padY = 40;

  return nodes.map((n) => {
    const d = depthOf(n);
    const li = lx.get(n.id) ?? 0;
    const maxL = Math.max(1, leafCount - 1);
    const x = padX + (li / maxL) * xSpan;
    const y = padY + (d / maxD) * ySpan;
    return { ...n, x, y };
  });
}

export function layoutBounds(
  laid: { x: number; y: number }[],
  pad = 36,
): LayoutBounds {
  if (laid.length === 0) {
    return { minX: 0, minY: 0, maxX: 200, maxY: 300, width: 200, height: 300 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of laid) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
  }
  // Keep square-ish padding so small locus chips don't crush leaf nodes
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const padX = Math.max(pad, spanX * 0.12);
  const padY = Math.max(pad, spanY * 0.12);
  minX -= padX;
  minY -= padY;
  maxX += padX;
  maxY += padY;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(80, maxX - minX),
    height: Math.max(80, maxY - minY),
  };
}

export function viewBoxString(b: LayoutBounds): string {
  return `${b.minX} ${b.minY} ${b.width} ${b.height}`;
}
