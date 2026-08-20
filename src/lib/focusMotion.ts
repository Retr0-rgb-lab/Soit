import type { Edge, InquiryNode } from "../types";

export type FocusNavKind = "jump" | "deepen" | "diverge" | "back";

/** Shared focus-transition duration (ms) — keep in sync with `--motion-focus`. */
export const FOCUS_MOTION_MS = 320;

/**
 * Infer card enter direction from tree/edge relation when the caller
 * did not set an explicit nav kind (orbit / map / palette jumps).
 */
export function inferFocusNavKind(
  prevId: string | null | undefined,
  nextId: string | null | undefined,
  nodes: InquiryNode[],
  edges: Edge[] = [],
): FocusNavKind {
  if (!prevId || !nextId || prevId === nextId) return "jump";

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const prev = byId.get(prevId);
  const next = byId.get(nextId);
  if (!prev || !next) return "jump";

  // Child → parent
  if (prev.parentId === nextId) return "back";

  // Parent → child
  if (next.parentId === prevId) {
    const edge = edges.find(
      (e) => e.fromCardId === prevId && e.toCardId === nextId,
    );
    if (edge?.kind === "diverge" || next.kind === "diverge") return "diverge";
    return "deepen";
  }

  // Siblings
  if (
    prev.parentId &&
    next.parentId &&
    prev.parentId === next.parentId
  ) {
    return "diverge";
  }

  // Ancestor deeper than parent (e.g. grandchild → root)
  let walk: InquiryNode | undefined = prev;
  const guard = new Set<string>();
  while (walk?.parentId && !guard.has(walk.id)) {
    guard.add(walk.id);
    if (walk.parentId === nextId) return "back";
    walk = byId.get(walk.parentId);
  }

  // Descendant of next
  walk = next;
  guard.clear();
  while (walk?.parentId && !guard.has(walk.id)) {
    guard.add(walk.id);
    if (walk.parentId === prevId) {
      return next.kind === "diverge" ? "diverge" : "deepen";
    }
    walk = byId.get(walk.parentId);
  }

  return "jump";
}
