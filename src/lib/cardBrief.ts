import type { Edge, InquiryNode, Turn } from "../types";
import { parseAssistantContent } from "./chat/openaiCompat";
import type { ChatCompleteResult, ChatMark } from "./chat/port";
import { stripHtml } from "./chat/port";
import { inboundEdge } from "./deepenScope";

/** Default recent-turn cap for external brief (chat deepenScope stays at 8). */
export const BRIEF_MESSAGE_CAP = 16;

/** Fixed Soit handoff contract (Chinese). */
export const BRIEF_INSTRUCTIONS =
  "结果请用纯文本返回；技术术语可选用 [[term]] 标记一次。不要假设已修改 universe.db；不要创建 Soit 卡片 id。";

export interface CardBriefMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CardBriefDeepen {
  parent: {
    title: string;
    status?: string;
    question?: string | null;
    stuck?: string | null;
    next?: string | null;
  };
  span: { text: string; turnId?: string };
  why?: string;
}

export interface CardBrief {
  version: 1;
  exportedAt: string;
  cardId: string;
  title: string;
  status?: string;
  question?: string | null;
  stuck?: string | null;
  next?: string | null;
  kind?: string;
  /** This card only — plain text, capped. */
  messages: CardBriefMessage[];
  /** Only when inbound deepen edge. */
  deepen?: CardBriefDeepen;
  skillsText?: string;
  vaultPath?: string | null;
  instructions: string;
}

export interface BuildCardBriefInput {
  cardId: string;
  nodes: InquiryNode[];
  turnsByCardId: Record<string, Turn[]>;
  edges: Edge[];
  skillsText?: string;
  vaultPath?: string | null;
  messageCap?: number;
  /** Override export timestamp (tests). */
  now?: Date | string;
}

/** Turns → plain user/assistant messages (this card only). */
export function messagesFromCardTurns(
  turns: Turn[],
  messageCap: number = BRIEF_MESSAGE_CAP,
): CardBriefMessage[] {
  const slice = turns.slice(-Math.max(0, messageCap));
  const msgs: CardBriefMessage[] = [];
  for (const t of slice) {
    if (t.user?.trim()) {
      msgs.push({ role: "user", content: t.user });
    }
    if (t.aiHtml?.trim()) {
      const plain = stripHtml(t.aiHtml);
      if (plain) msgs.push({ role: "assistant", content: plain });
    }
  }
  return msgs;
}

/**
 * Pure card brief for export / runtime handoff (Spec §2.3).
 * Deepen block uses parent inquiry fields + span + why only — never parent turns.
 */
export function buildCardBrief(input: BuildCardBriefInput): CardBrief {
  const {
    cardId,
    nodes,
    turnsByCardId,
    edges,
    skillsText,
    vaultPath,
    messageCap = BRIEF_MESSAGE_CAP,
    now,
  } = input;

  const node = nodes.find((n) => n.id === cardId);
  const turns = turnsByCardId[cardId] ?? [];
  const exportedAt =
    typeof now === "string"
      ? now
      : (now ?? new Date()).toISOString();

  const brief: CardBrief = {
    version: 1,
    exportedAt,
    cardId,
    title: node?.title ?? "",
    status: node?.status,
    question: node?.question ?? null,
    stuck: node?.stuck ?? null,
    next: node?.next ?? null,
    kind: node?.kind,
    messages: messagesFromCardTurns(turns, messageCap),
    instructions: BRIEF_INSTRUCTIONS,
  };

  if (skillsText != null && skillsText !== "") {
    brief.skillsText = skillsText;
  }
  if (vaultPath !== undefined) {
    brief.vaultPath = vaultPath;
  }

  const edge = inboundEdge(cardId, edges);
  if (edge?.kind === "deepen") {
    const parentNode = nodes.find((n) => n.id === edge.fromCardId);
    brief.deepen = {
      parent: {
        title: parentNode?.title ?? "",
        status: parentNode?.status,
        question: parentNode?.question ?? null,
        stuck: parentNode?.stuck ?? null,
        next: parentNode?.next ?? null,
      },
      span: {
        text: edge.source.text,
        ...(edge.source.turnId ? { turnId: edge.source.turnId } : {}),
      },
      ...(edge.why != null && edge.why !== "" ? { why: edge.why } : {}),
    };
  }

  return brief;
}

/** Stable markdown serialization for clipboard / brief.md. */
export function cardBriefToMarkdown(brief: CardBrief): string {
  const lines: string[] = [
    `# ${brief.title || brief.cardId}`,
    "",
    `- version: ${brief.version}`,
    `- exportedAt: ${brief.exportedAt}`,
    `- cardId: ${brief.cardId}`,
  ];
  if (brief.kind) lines.push(`- kind: ${brief.kind}`);
  if (brief.status) lines.push(`- status: ${brief.status}`);
  if (brief.question) lines.push(`- question: ${brief.question}`);
  if (brief.stuck) lines.push(`- stuck: ${brief.stuck}`);
  if (brief.next) lines.push(`- next: ${brief.next}`);
  if (brief.vaultPath) lines.push(`- vaultPath: ${brief.vaultPath}`);

  if (brief.deepen) {
    lines.push("", "## Deepen", "");
    lines.push(`- parent.title: ${brief.deepen.parent.title}`);
    if (brief.deepen.parent.status) {
      lines.push(`- parent.status: ${brief.deepen.parent.status}`);
    }
    if (brief.deepen.parent.question) {
      lines.push(`- parent.question: ${brief.deepen.parent.question}`);
    }
    if (brief.deepen.parent.stuck) {
      lines.push(`- parent.stuck: ${brief.deepen.parent.stuck}`);
    }
    if (brief.deepen.parent.next) {
      lines.push(`- parent.next: ${brief.deepen.parent.next}`);
    }
    lines.push(`- span.text: ${brief.deepen.span.text}`);
    if (brief.deepen.span.turnId) {
      lines.push(`- span.turnId: ${brief.deepen.span.turnId}`);
    }
    if (brief.deepen.why) lines.push(`- why: ${brief.deepen.why}`);
  }

  if (brief.skillsText) {
    lines.push("", "## Skills", "", brief.skillsText);
  }

  lines.push("", "## Messages", "");
  if (!brief.messages.length) {
    lines.push("_（无回合）_");
  } else {
    for (const m of brief.messages) {
      lines.push(`### ${m.role}`, "", m.content, "");
    }
  }

  lines.push("## Instructions", "", brief.instructions, "");
  return lines.join("\n");
}

/** Import external agent plain text; reuses [[term]] parser. */
export function parseAssistantImport(
  raw: string,
): { text: string; marks?: ChatMark[] } {
  return parseAssistantContent(raw) as ChatCompleteResult;
}
