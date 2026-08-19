import type { Edge, InquiryNode, InquiryStatus, SourceSpan, Turn } from "../types";

export interface DeepenScopeState {
  nodes: InquiryNode[];
  turnsByCardId: Record<string, Turn[]>;
  edges: Edge[];
}

export interface DeepenScope {
  parentStatus?: InquiryStatus | string;
  span: SourceSpan;
  why?: string;
  /** Recent turns on the child card only — never full parent transcript. */
  recentTurns: Turn[];
}

const RECENT_TURN_CAP = 8;

/**
 * Build deepen context for a child card from its inbound edge.
 * Scope = parent status + source span + why + this card's recent turns.
 * Does not dump the parent transcript.
 */
export function buildDeepenScope(
  cardId: string,
  edgeId: string,
  state: DeepenScopeState,
): DeepenScope | null {
  const edge = state.edges.find((e) => e.id === edgeId);
  if (!edge || edge.toCardId !== cardId) return null;
  if (edge.kind !== "deepen") return null;

  const parent = state.nodes.find((n) => n.id === edge.fromCardId);
  const turns = state.turnsByCardId[cardId] ?? [];
  const recentTurns = turns.slice(-RECENT_TURN_CAP).map((t) => ({ ...t }));

  return {
    parentStatus: parent?.status,
    span: { ...edge.source },
    why: edge.why,
    recentTurns,
  };
}

/** Outbound edges from a card (marks that already spawned children). */
export function outboundEdges(fromCardId: string, edges: Edge[]): Edge[] {
  return edges.filter((e) => e.fromCardId === fromCardId);
}

/** Inbound edge that created this card (if any). */
export function inboundEdge(toCardId: string, edges: Edge[]): Edge | undefined {
  return edges.find((e) => e.toCardId === toCardId);
}
