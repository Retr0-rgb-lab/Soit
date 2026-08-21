import {
  resolveExplainPort,
  type ChatMessage,
} from "../lib/chat";
import { stripThinkForExplain } from "../lib/chat/splitThink";
import {
  getExplainCached,
  setExplainCached,
} from "../lib/explainCache";

const FALLBACK_EXPLAIN_SYSTEM = [
  "用 2–4 句中文解释下列词或选区，帮助读者先读懂。",
  "禁止大纲、列表、标题、代码块；禁止 [[双括号]] 标记；不要建议建卡。",
  "直接输出解释正文；禁止思维链、思考过程或 <think> 标签。",
].join("");

export type ExplainSpanOpts = {
  cardId: string;
  span: string;
  contextMessages?: ChatMessage[];
  signal?: AbortSignal;
  /**
   * PEL-163: skip per-card cache (e.g. user hit 重试).
   * Default false — same card + same span reuses prior body without model call.
   */
  skipCache?: boolean;
};

/**
 * Single entry for short explain (Spec §2.2).
 * UI/overlays must call this — never port.explain / fetch directly.
 * Does not write turns, universe.db, or Obsidian.
 * Caches successful results **per cardId** (PEL-163).
 */
export async function explainSpan(opts: ExplainSpanOpts): Promise<string> {
  const span = (opts.span ?? "").trim();
  if (!span) {
    throw new Error("explainSpan: empty span");
  }
  const cardId = (opts.cardId ?? "").trim();

  if (!opts.skipCache && cardId) {
    const cached = getExplainCached(cardId, span);
    if (cached) return cached;
  }

  const port = await resolveExplainPort();

  let text = "";
  if (typeof port.explain === "function") {
    const result = await port.explain({
      cardId: opts.cardId,
      span,
      contextMessages: opts.contextMessages,
      signal: opts.signal,
    });
    text = stripThinkForExplain(result.text ?? "").trim();
    if (!text) {
      throw new Error("explainSpan: empty explain result");
    }
  } else {
    // Fallback when runtime port lacks explain — strong system, no marks / no think.
    const messages: ChatMessage[] = [
      { role: "system", content: FALLBACK_EXPLAIN_SYSTEM },
      ...(opts.contextMessages ?? []).slice(-6),
      { role: "user", content: `请解释（只要正文）：${span.slice(0, 500)}` },
    ];
    const result = await port.complete({
      cardId: opts.cardId,
      messages,
      signal: opts.signal,
    });
    text = stripThinkForExplain(result.text ?? "").trim();
    if (!text) {
      throw new Error("explainSpan: empty complete fallback");
    }
  }

  if (cardId) setExplainCached(cardId, span, text);
  return text;
}
