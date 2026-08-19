import type { InquiryNode } from "../types";

/** Ancestor chain root → … → focus (inclusive). */
export function ancestorChain(
  nodes: InquiryNode[],
  focusId: string,
): InquiryNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parts: InquiryNode[] = [];
  let cur = byId.get(focusId);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    parts.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts;
}

/** Local neighborhood: parent, focus, siblings, children. */
export function locusNodes(
  nodes: InquiryNode[],
  focusId: string,
): InquiryNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const focus = byId.get(focusId);
  if (!focus) return [];

  const ids = new Set<string>([focus.id]);
  if (focus.parentId && byId.has(focus.parentId)) {
    ids.add(focus.parentId);
    for (const n of nodes) {
      if (n.parentId === focus.parentId) ids.add(n.id);
    }
  }
  for (const n of nodes) {
    if (n.parentId === focus.id) ids.add(n.id);
  }
  return nodes.filter((n) => ids.has(n.id));
}

export function kindGlyph(kind: InquiryNode["kind"]): string {
  if (kind === "root") return "●";
  if (kind === "deepen") return "↓";
  return "↗";
}

export type Crumb = { id: string; title: string };

export const ELLIPSIS_CRUMB_ID = "__ellipsis__";

/**
 * Collapse deep ancestor chains for breadcrumb UI.
 * length ≤ threshold → unchanged; else root / … / parent / current.
 */
export function collapseCrumbs(
  chain: Crumb[],
  opts: { threshold?: number } = {},
): Crumb[] {
  const threshold = opts.threshold ?? 4;
  if (chain.length <= threshold) return chain;
  const root = chain[0]!;
  const current = chain[chain.length - 1]!;
  const parent = chain[chain.length - 2]!;
  return [
    root,
    { id: ELLIPSIS_CRUMB_ID, title: "…" },
    parent,
    current,
  ];
}
