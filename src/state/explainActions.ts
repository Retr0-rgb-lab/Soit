import {
  resolvePort,
  type ChatMessage,
} from "../lib/chat";

const FALLBACK_EXPLAIN_SYSTEM = [
  "用 2–4 句中文解释下列词或选区，帮助读者先读懂。",
  "禁止大纲、列表、标题、代码块；禁止 [[双括号]] 标记；不要建议建卡。",
].join("");

export type ExplainSpanOpts = {
  cardId: string;
  span: string;
  contextMessages?: ChatMessage[];
  signal?: AbortSignal;
};

/**
 * Single entry for short explain (Spec §2.2).
 * UI/overlays must call this — never port.explain / fetch directly.
 * Does not write turns, universe.db, or Obsidian.
 */
export async function explainSpan(opts: ExplainSpanOpts): Promise<string> {
  const span = (opts.span ?? "").trim();
  if (!span) {
    throw new Error("explainSpan: empty span");
  }

  const port = await resolvePort();

  if (typeof port.explain === "function") {
    const result = await port.explain({
      cardId: opts.cardId,
      span,
      contextMessages: opts.contextMessages,
      signal: opts.signal,
    });
    const text = (result.text ?? "").trim();
    if (!text) {
      throw new Error("explainSpan: empty explain result");
    }
    return text;
  }

  // Fallback when runtime port lacks explain — strong system, no marks.
  const messages: ChatMessage[] = [
    { role: "system", content: FALLBACK_EXPLAIN_SYSTEM },
    ...(opts.contextMessages ?? []).slice(-6),
    { role: "user", content: `请解释：${span.slice(0, 500)}` },
  ];
  const result = await port.complete({
    cardId: opts.cardId,
    messages,
    signal: opts.signal,
  });
  const text = (result.text ?? "").trim();
  if (!text) {
    throw new Error("explainSpan: empty complete fallback");
  }
  return text;
}
