import type {
  ChatCompleteInput,
  ChatCompleteResult,
  ChatMark,
  ChatPort,
} from "./port";

const GLOSSARY: ChatMark[] = [
  {
    term: "函子",
    explanation: "范畴之间的映射：对象→对象，态射→态射，保住复合与单位。",
  },
  {
    term: "范畴",
    explanation: "对象 + 态射 + 复合 + 单位。",
  },
  {
    term: "自然变换",
    explanation: "函子之间的态射。",
  },
];

function pickMarks(userText: string, scope: unknown): ChatMark[] {
  const hay = userText + " " + JSON.stringify(scope ?? {});
  const hit = GLOSSARY.filter((m) => hay.includes(m.term));
  if (hit.length > 0) return hit.slice(0, 3);
  // Default structured marks so UI can still fork.
  return [GLOSSARY[0]!, GLOSSARY[1]!];
}

function scopeHint(scope: unknown): string {
  if (!scope || typeof scope !== "object") return "";
  const s = scope as {
    span?: { text?: string };
    why?: string;
    parentStatus?: string;
  };
  const parts: string[] = [];
  if (s.span?.text) parts.push(`源跨度「${s.span.text}」`);
  if (s.why) parts.push(`原因：${s.why}`);
  if (s.parentStatus) parts.push(`父状态 ${s.parentStatus}`);
  return parts.length ? `（深挖范围：${parts.join(" · ")}）` : "";
}

/**
 * Local MockChat — no network. Returns text + structured marks.
 * Marks are applied to HTML by the store via applyMarksHtml / completeResultToHtml.
 */
export class MockChat implements ChatPort {
  async complete(input: ChatCompleteInput): Promise<ChatCompleteResult> {
    const lastUser = [...input.messages]
      .reverse()
      .find((m) => m.role === "user");
    const q = (lastUser?.content ?? "").trim() || "（空消息）";
    const marks = pickMarks(q, input.scope);
    const terms = marks.map((m) => m.term).join("、");
    const hint = scopeHint(input.scope);
    const preview = q.length > 80 ? `${q.slice(0, 80)}…` : q;

    const text = [
      `（MockChat）已收到：${preview}${hint}`,
      `可继续点开 ${terms} 做深挖或发散。重生只改本轮，不长新卡。`,
    ].join("\n");

    return { text, marks };
  }
}

export function createMockChat(): ChatPort {
  return new MockChat();
}
