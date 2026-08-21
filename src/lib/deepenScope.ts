import type { Edge, InquiryNode, InquiryStatus, SourceSpan, Turn } from "../types";
import {
  KEEP_RECENT_TURNS,
  compactThread,
  type CompactTurn,
} from "./chat/contextCompact";
import { ancestorChain } from "./treeNav";

export interface DeepenScopeState {
  nodes: InquiryNode[];
  turnsByCardId: Record<string, Turn[]>;
  edges: Edge[];
}

/** Parent inquiry fields — hard structural facts (never a transcript dump). */
export interface DeepenScopeParent {
  title: string;
  status?: InquiryStatus | string;
  question?: string | null;
  stuck?: string | null;
  next?: string | null;
}

/**
 * Full-fidelity recent parent turn (Pi keep-recent).
 * Not the old 280-char clip bridge.
 */
export type ParentRecentTurn = CompactTurn;

/**
 * Fork scope (deepen | diverge) — Pi-style context packing:
 *
 * 1. **Hard context** — lineage, kind, parent fields, span, why
 * 2. **Implicit compact** — structured condensation of older parent turns
 * 3. **Recent full** — last 1–2 parent turns complete
 * 4. Child recentTurns remain child-only (messages path also compacts long child threads)
 */
export interface ForkScope {
  kind: "deepen" | "diverge";
  /** Root → … → parent titles (this card excluded). */
  lineage: string[];
  parent: DeepenScopeParent;
  span: SourceSpan;
  why?: string;
  /**
   * Pi-style structured compact of parent turns *before* the keep-recent cut.
   * null when parent has ≤ KEEP_RECENT_TURNS turns.
   */
  parentCompact: string | null;
  /** Last 1–2 parent turns at full fidelity. */
  parentRecent: ParentRecentTurn[];
  /** @deprecated use parentRecent — kept for one release of call-site greps */
  parentBridge: ParentRecentTurn[];
  /** How many parent turns were folded into parentCompact. */
  parentCompactedTurnCount: number;
  /** Recent turns on the child card only (not parent). */
  recentTurns: Turn[];
}

/** @deprecated alias — prefer ForkScope */
export type DeepenScope = ForkScope;

const CHILD_RECENT_TURN_CAP = 8;

/**
 * Build fork context for a child card from its inbound edge (deepen or diverge).
 */
export function buildForkScope(
  cardId: string,
  edgeId: string,
  state: DeepenScopeState,
): ForkScope | null {
  const edge = state.edges.find((e) => e.id === edgeId);
  if (!edge || edge.toCardId !== cardId) return null;
  if (edge.kind !== "deepen" && edge.kind !== "diverge") return null;

  const parentNode = state.nodes.find((n) => n.id === edge.fromCardId);
  const chain = ancestorChain(state.nodes, cardId);
  const lineage = chain.slice(0, -1).map((n) => n.title);

  const parentTurns = state.turnsByCardId[edge.fromCardId] ?? [];
  const childTurns = state.turnsByCardId[cardId] ?? [];
  const recentTurns = childTurns
    .slice(-CHILD_RECENT_TURN_CAP)
    .map((t) => ({ ...t }));

  const packed = compactThread(parentTurns, {
    title: parentNode?.title,
    question: parentNode?.question,
    stuck: parentNode?.stuck,
    next: parentNode?.next,
    spanText: edge.source?.text,
    kind: edge.kind,
  }, KEEP_RECENT_TURNS);

  return {
    kind: edge.kind,
    lineage,
    parent: {
      title: parentNode?.title ?? "",
      status: parentNode?.status,
      question: parentNode?.question ?? null,
      stuck: parentNode?.stuck ?? null,
      next: parentNode?.next ?? null,
    },
    span: { ...edge.source },
    why: edge.why,
    parentCompact: packed.compact,
    parentRecent: packed.recent,
    parentBridge: packed.recent,
    parentCompactedTurnCount: packed.compactedTurnCount,
    recentTurns,
  };
}

/**
 * Deepen-only scope (tests + legacy). Returns null for diverge edges.
 */
export function buildDeepenScope(
  cardId: string,
  edgeId: string,
  state: DeepenScopeState,
): ForkScope | null {
  const edge = state.edges.find((e) => e.id === edgeId);
  if (!edge || edge.kind !== "deepen") return null;
  return buildForkScope(cardId, edgeId, state);
}

/** Outbound edges from a card (marks that already spawned children). */
export function outboundEdges(fromCardId: string, edges: Edge[]): Edge[] {
  return edges.filter((e) => e.fromCardId === fromCardId);
}

/** Inbound edge that created this card (if any). */
export function inboundEdge(toCardId: string, edges: Edge[]): Edge | undefined {
  return edges.find((e) => e.toCardId === toCardId);
}
