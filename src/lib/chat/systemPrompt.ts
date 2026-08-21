/** Inquiry-assistant system prompt (Spec §2.2) + Pi-style fork packing. */

import { formatRecentDialogue } from "./contextCompact";

type ForkScopeLike = {
  kind?: string;
  lineage?: string[];
  parent?: {
    title?: string;
    status?: string;
    question?: string | null;
    stuck?: string | null;
    next?: string | null;
  };
  span?: { text?: string; turnId?: string; markId?: string };
  why?: string;
  parentCompact?: string | null;
  parentRecent?: Array<{
    title?: string;
    user?: string;
    assistant?: string;
  }>;
  parentBridge?: Array<{
    title?: string;
    user?: string;
    assistant?: string;
  }>;
  parentCompactedTurnCount?: number;
};

function describeHardContext(s: ForkScopeLike): string {
  const lines: string[] = [
    "## Hard context (structural — always trust)",
    "You are continuing an inquiry tree — not a cold new chat.",
    `Fork kind: ${s.kind ?? "unknown"}.`,
  ];
  if (s.lineage?.length) {
    lines.push(`Lineage (root → parent): ${s.lineage.join(" › ")}.`);
  }
  if (s.parent?.title) lines.push(`Parent card: ${s.parent.title}.`);
  if (s.parent?.status) lines.push(`Parent status: ${s.parent.status}`);
  if (s.parent?.question) lines.push(`Parent question: ${s.parent.question}`);
  if (s.parent?.stuck) lines.push(`Parent stuck: ${s.parent.stuck}`);
  if (s.parent?.next) lines.push(`Parent next: ${s.parent.next}`);
  if (s.span?.text) {
    lines.push(
      `Forked from source span: 「${String(s.span.text).slice(0, 400)}」.`,
    );
  }
  if (s.span?.turnId) lines.push(`Source turnId: ${s.span.turnId}`);
  if (s.why) lines.push(`Fork why: ${s.why}`);
  return lines.join("\n");
}

function describeForkScope(scope: unknown): string {
  if (scope == null || typeof scope !== "object") {
    return `Fork scope: ${JSON.stringify(scope).slice(0, 800)}`;
  }
  const s = scope as ForkScopeLike;
  const parts: string[] = [describeHardContext(s)];

  // Implicit compact (Pi: everything before keep-recent cut)
  if (s.parentCompact?.trim()) {
    parts.push(
      "",
      "## Parent compact (implicit · older parent turns condensed)",
      s.parentCompact.trim(),
    );
    if (typeof s.parentCompactedTurnCount === "number") {
      parts.push(`(folded turns: ${s.parentCompactedTurnCount})`);
    }
  }

  // Full recent 1–2 parent turns
  const recent = s.parentRecent?.length
    ? s.parentRecent
    : s.parentBridge ?? [];
  if (recent.length) {
    parts.push(
      "",
      formatRecentDialogue(
        recent.map((t) => ({
          title: t.title,
          user: t.user ?? "",
          assistant: t.assistant ?? "",
        })),
        "Parent recent dialogue (full · last 1–2 turns)",
      ),
    );
  }

  parts.push(
    "",
    "## Rules",
    "- Use hard context + compact + recent parent turns to stay coherent.",
    "- Answer on **this** card's thread (user/assistant messages below).",
    "- Do not pretend you saw parent turns outside compact + recent blocks.",
    "- Do not dump or restate the entire compact unless the user asks.",
  );

  return parts.join("\n");
}

export function buildInquirySystemPrompt(scope?: unknown): string {
  const bits = [
    "You are Soit, an inquiry-workspace assistant. Reply in the user's language.",
    "Be concise. When introducing technical terms worth forking, wrap each once as [[term]].",
    "Put chain-of-thought inside <think>...</think> if needed; the final answer stays outside.",
  ];
  if (scope != null) {
    bits.push("", describeForkScope(scope));
  }
  return bits.join("\n");
}
