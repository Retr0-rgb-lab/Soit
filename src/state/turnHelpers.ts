import {
  type ChatMessage,
  stripHtml,
} from "../lib/chat";
import { buildDeepenScope, inboundEdge } from "../lib/deepenScope";
import { getEnabledSkillsText } from "../lib/host";
import type { Turn } from "../types";
import type { WorkspaceState } from "./workspaceStore";

let idSeq = 0;

export function resetIdSeq(): void {
  idSeq = 0;
}

export function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeq}`;
}

/** Prepend enabled SKILL.md bodies as a system message when vault has skills. */
export async function withSkillsSystem(
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  try {
    const text = (await getEnabledSkillsText()).trim();
    if (!text) return messages;
    return [{ role: "system", content: text }, ...messages];
  } catch {
    return messages;
  }
}

/** Build chat messages from turns up to `untilIndex` (exclusive of assistant at until). */
export function messagesFromTurns(
  turns: Turn[],
  opts?: { untilIndex?: number; includeAssistantAtUntil?: boolean },
): ChatMessage[] {
  const end = opts?.untilIndex ?? turns.length;
  const msgs: ChatMessage[] = [];
  for (let i = 0; i < end; i++) {
    const t = turns[i]!;
    if (t.user?.trim()) {
      msgs.push({ role: "user", content: t.user });
    }
    const includeAi =
      i < end - 1 || opts?.includeAssistantAtUntil === true;
    if (includeAi && t.aiHtml?.trim()) {
      const plain = stripHtml(t.aiHtml);
      if (plain) msgs.push({ role: "assistant", content: plain });
    }
  }
  return msgs;
}

export function scopeForCard(
  s: Pick<WorkspaceState, "nodes" | "turnsByCardId" | "edges">,
  cardId: string,
): unknown {
  const edge = inboundEdge(cardId, s.edges);
  if (!edge || edge.kind !== "deepen") return undefined;
  return buildDeepenScope(cardId, edge.id, {
    nodes: s.nodes,
    turnsByCardId: s.turnsByCardId,
    edges: s.edges,
  });
}

export type StoreSet = (
  partial:
    | Partial<WorkspaceState>
    | ((s: WorkspaceState) => Partial<WorkspaceState>),
) => void;

export type StoreGet = () => WorkspaceState;

export function patchTurnAi(
  set: StoreSet,
  cardId: string,
  turnId: string,
  patch: Partial<Pick<Turn, "aiHtml" | "think" | "thinkOpen" | "collapsed" | "title" | "user">>,
): void {
  set((s) => {
    const turns = s.turnsByCardId[cardId];
    if (!turns) return {};
    return {
      turnsByCardId: {
        ...s.turnsByCardId,
        [cardId]: turns.map((t) =>
          t.id === turnId ? { ...t, ...patch } : t,
        ),
      },
    };
  });
}

/** Resolve which card owns `turnId`. Prefer explicit cardId, then focusId, then scan. */
export function resolveTurnCard(
  s: Pick<WorkspaceState, "turnsByCardId" | "focusId">,
  turnId: string,
  cardId?: string,
): { cardId: string; turnIndex: number } | null {
  if (cardId) {
    const turns = s.turnsByCardId[cardId];
    if (!turns) return null;
    const turnIndex = turns.findIndex((t) => t.id === turnId);
    if (turnIndex < 0) return null;
    return { cardId, turnIndex };
  }
  if (s.focusId) {
    const turns = s.turnsByCardId[s.focusId];
    const turnIndex = turns?.findIndex((t) => t.id === turnId) ?? -1;
    if (turnIndex >= 0) return { cardId: s.focusId, turnIndex };
  }
  for (const [cid, turns] of Object.entries(s.turnsByCardId)) {
    const turnIndex = turns.findIndex((t) => t.id === turnId);
    if (turnIndex >= 0) return { cardId: cid, turnIndex };
  }
  return null;
}

export function isUniverseSource(
  source: WorkspaceState["source"],
): boolean {
  return source === "universe";
}
