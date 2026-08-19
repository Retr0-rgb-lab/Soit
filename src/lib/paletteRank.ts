import type { InquiryNode } from "../types";
import { ancestorChain } from "./treeNav";

export const PALETTE_RESULT_CAP = 40;

export type PaletteRankInput = {
  nodes: InquiryNode[];
  query: string;
  focusId: string;
  recentIds: string[];
  cap?: number;
};

function depthFromFocus(
  nodes: InquiryNode[],
  focusId: string,
  id: string,
): number {
  const chain = ancestorChain(nodes, focusId);
  const idx = chain.findIndex((n) => n.id === id);
  if (idx >= 0) return chain.length - 1 - idx;
  // distance via shared ancestor — crude: title only
  return 99;
}

function scoreQuery(n: InquiryNode, q: string): number {
  if (!q) return 0;
  const t = n.title.toLowerCase();
  if (t.startsWith(q)) return 2000 - Math.abs(t.length - q.length);
  const i = t.indexOf(q);
  if (i < 0) return -1;
  return 1000 - i * 10 - Math.abs(t.length - q.length);
}

/**
 * Rank nodes for Ctrl+K.
 * Empty query: recent → unread → ancestors (no full dump).
 * Query: prefix > substring; tie-break recent, unread, depth near focus.
 */
export function rankPaletteNodes(input: PaletteRankInput): {
  items: InquiryNode[];
  totalMatched: number;
} {
  const {
    nodes,
    query,
    focusId,
    recentIds,
    cap = PALETTE_RESULT_CAP,
  } = input;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const q = query.trim().toLowerCase();
  const recentRank = new Map(recentIds.map((id, i) => [id, i]));

  if (!q) {
    const seen = new Set<string>();
    const ordered: InquiryNode[] = [];
    const push = (id: string) => {
      if (seen.has(id)) return;
      const n = byId.get(id);
      if (!n) return;
      seen.add(id);
      ordered.push(n);
    };
    for (const id of recentIds) push(id);
    const unread = nodes
      .filter((n) => n.unread)
      .sort((a, b) => a.title.localeCompare(b.title, "zh"));
    for (const n of unread) push(n.id);
    for (const n of ancestorChain(nodes, focusId)) push(n.id);
    return {
      items: ordered.slice(0, cap),
      totalMatched: ordered.length,
    };
  }

  const scored = nodes
    .map((n) => {
      const s = scoreQuery(n, q);
      if (s < 0) return null;
      const rec = recentRank.has(n.id)
        ? 100 - (recentRank.get(n.id) ?? 99)
        : 0;
      const un = n.unread ? 20 : 0;
      const near = Math.max(0, 30 - depthFromFocus(nodes, focusId, n.id));
      return { n, s: s + rec + un + near };
    })
    .filter((x): x is { n: InquiryNode; s: number } => x != null)
    .sort((a, b) => {
      if (b.s !== a.s) return b.s - a.s;
      return a.n.title.localeCompare(b.n.title, "zh");
    });

  return {
    items: scored.slice(0, cap).map((x) => x.n),
    totalMatched: scored.length,
  };
}
