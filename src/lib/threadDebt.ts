import type { InquiryNode } from "../types";
import { ancestorChain } from "./treeNav";

export type ThreadDebt = {
  /** Root (or topmost) id of the thread */
  rootId: string;
  rootTitle: string;
  unreadCount: number;
  /** Sample unread card ids (stable) */
  sampleIds: string[];
};

/** Root of the inquiry tree for a node. */
export function rootOf(
  nodes: InquiryNode[],
  id: string,
): InquiryNode | undefined {
  const chain = ancestorChain(nodes, id);
  return chain[0];
}

/**
 * Group unread cards by root thread (注意力债).
 * Sorted by unreadCount desc, then title.
 */
export function groupUnreadByThread(
  nodes: InquiryNode[],
  focusId: string,
  opts: { samplePerThread?: number } = {},
): ThreadDebt[] {
  const samplePerThread = opts.samplePerThread ?? 3;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const buckets = new Map<string, InquiryNode[]>();

  for (const n of nodes) {
    if (!n.unread || n.id === focusId) continue;
    const root = rootOf(nodes, n.id) ?? n;
    const list = buckets.get(root.id) ?? [];
    list.push(n);
    buckets.set(root.id, list);
  }

  const out: ThreadDebt[] = [];
  for (const [rootId, list] of buckets) {
    const root = byId.get(rootId);
    const sorted = list
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title, "zh"));
    out.push({
      rootId,
      rootTitle: root?.title ?? rootId,
      unreadCount: sorted.length,
      sampleIds: sorted.slice(0, samplePerThread).map((n) => n.id),
    });
  }

  return out.sort((a, b) => {
    if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
    return a.rootTitle.localeCompare(b.rootTitle, "zh");
  });
}

/** All node ids in the subtree of rootId (inclusive). */
export function subtreeIds(nodes: InquiryNode[], rootId: string): string[] {
  const kids = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const list = kids.get(n.parentId) ?? [];
    list.push(n.id);
    kids.set(n.parentId, list);
  }
  const out: string[] = [];
  const stack = [rootId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const c of kids.get(id) ?? []) stack.push(c);
  }
  return out;
}
