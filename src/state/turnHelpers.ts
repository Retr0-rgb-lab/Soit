import {
  type ChatMessage,
  stripHtml,
} from "../lib/chat";
import {
  KEEP_RECENT_TURNS,
  compactThread,
} from "../lib/chat/contextCompact";
import { buildForkScope, inboundEdge } from "../lib/deepenScope";
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

export type MessagesFromTurnsOpts = {
  untilIndex?: number;
  includeAssistantAtUntil?: boolean;
  /**
   * Pi-style: fold turns before the last KEEP_RECENT_TURNS into one system compact.
   * Default true. Set false only for tests that need a flat transcript.
   */
  compact?: boolean;
  /** Optional card meta improves compact Goal / Constraints sections. */
  compactMeta?: {
    title?: string;
    question?: string | null;
    stuck?: string | null;
    next?: string | null;
    kind?: string;
  };
};

function emitTurnMessages(
  turns: Turn[],
  includeAssistantAtUntil: boolean,
): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i]!;
    if (t.user?.trim()) {
      msgs.push({ role: "user", content: t.user });
    }
    const includeAi =
      i < turns.length - 1 || includeAssistantAtUntil === true;
    if (includeAi && t.aiHtml?.trim()) {
      const plain = stripHtml(t.aiHtml);
      if (plain) msgs.push({ role: "assistant", content: plain });
    }
  }
  return msgs;
}

/**
 * Build chat messages from turns up to `untilIndex` (exclusive of assistant at until).
 * Long threads: older turns → structured compact system block; last 1–2 turns full.
 */
export function messagesFromTurns(
  turns: Turn[],
  opts?: MessagesFromTurnsOpts,
): ChatMessage[] {
  const end = opts?.untilIndex ?? turns.length;
  const slice = turns.slice(0, end);
  const includeAssistantAtUntil = opts?.includeAssistantAtUntil === true;
  const useCompact = opts?.compact !== false;

  if (!useCompact || slice.length <= KEEP_RECENT_TURNS) {
    return emitTurnMessages(slice, includeAssistantAtUntil);
  }

  const packed = compactThread(slice, opts?.compactMeta ?? {}, KEEP_RECENT_TURNS);
  const recentTurns = slice.slice(-KEEP_RECENT_TURNS);
  const msgs: ChatMessage[] = [];
  if (packed.compact?.trim()) {
    msgs.push({
      role: "system",
      content: [
        "## Prior turns on this card (compacted)",
        packed.compact.trim(),
        "",
        "Messages below are the latest turns at full fidelity.",
      ].join("\n"),
    });
  }
  msgs.push(...emitTurnMessages(recentTurns, includeAssistantAtUntil));
  return msgs;
}

/** Fork context for deepen/diverge children. Root cards → undefined. */
export function scopeForCard(
  s: Pick<WorkspaceState, "nodes" | "turnsByCardId" | "edges">,
  cardId: string,
): unknown {
  const edge = inboundEdge(cardId, s.edges);
  if (!edge) return undefined;
  return (
    buildForkScope(cardId, edge.id, {
      nodes: s.nodes,
      turnsByCardId: s.turnsByCardId,
      edges: s.edges,
    }) ?? undefined
  );
}

/** Card meta for same-card message compaction. */
export function compactMetaForCard(
  s: Pick<WorkspaceState, "nodes">,
  cardId: string,
): MessagesFromTurnsOpts["compactMeta"] {
  const n = s.nodes.find((x) => x.id === cardId);
  if (!n) return undefined;
  return {
    title: n.title,
    question: n.question ?? null,
    stuck: n.stuck ?? null,
    next: n.next ?? null,
    kind: n.kind,
  };
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
