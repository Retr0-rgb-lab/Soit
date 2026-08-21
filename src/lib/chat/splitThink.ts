/**
 * Split model output into formal reply vs thinking / chain-of-thought.
 * Used by complete + short-explain so UI can hide think by default (PEL-160/163).
 */

export type SplitThinkResult = {
  /** Formal user-facing answer (may be empty if model only emitted think). */
  text: string;
  /** Extracted thinking, if any. */
  think: string;
};

const BLOCK_TAGS = [
  "think",
  "thinking",
  "thought",
  "reasoning",
  "reflection",
  "redacted_reasoning",
] as const;

function stripMatchedBlocks(raw: string): SplitThinkResult {
  let text = raw;
  const chunks: string[] = [];

  for (const tag of BLOCK_TAGS) {
    const re = new RegExp(
      `<\\s*${tag}\\s*>[\\s\\S]*?<\\s*/\\s*${tag}\\s*>`,
      "gi",
    );
    text = text.replace(re, (full) => {
      const inner = full
        .replace(new RegExp(`^<\\s*${tag}\\s*>`, "i"), "")
        .replace(new RegExp(`<\\s*/\\s*${tag}\\s*>$`, "i"), "")
        .trim();
      if (inner) chunks.push(inner);
      return "\n";
    });
  }

  // Fenced thinking blocks: ```thinking / ```think / ```reasoning
  text = text.replace(
    /```(?:thinking|think|reasoning)\s*\n([\s\S]*?)```/gi,
    (_full, inner: string) => {
      const t = String(inner ?? "").trim();
      if (t) chunks.push(t);
      return "\n";
    },
  );

  // Unclosed <think>… to end (streaming / sloppy models)
  text = text.replace(/<\s*think(?:ing)?\s*>[\s\S]*$/i, (full) => {
    const inner = full.replace(/^<\s*think(?:ing)?\s*>/i, "").trim();
    if (inner) chunks.push(inner);
    return "";
  });

  return {
    text: text.replace(/\n{3,}/g, "\n\n").trim(),
    think: chunks.join("\n\n").trim(),
  };
}

/** Markdown-style "思考过程" / "Reasoning" headings before the answer. */
function splitLabeledPreamble(raw: string): SplitThinkResult | null {
  const re =
    /^(?:#{1,3}\s*)?(?:思考过程|思考|推理过程|推理|Reasoning|Thinking|Chain of [Tt]hought)\s*[:：]?\s*\n([\s\S]+?)(?:\n{2,}|(?=^#{1,3}\s)|(?=^(?:答案|回答|结论|Answer|Final)\s*[:：]))/m;
  const m = re.exec(raw);
  if (!m || m.index > 40) return null;
  const think = (m[1] ?? "").trim();
  const text = (
    raw.slice(0, m.index) + raw.slice(m.index + m[0].length)
  ).trim();
  if (!think) return null;
  return { text, think };
}

/**
 * Extract thinking from raw model content. Prefer XML-like blocks; fall back
 * to labeled preambles. Always returns trimmed strings.
 */
export function splitThinkContent(raw: string): SplitThinkResult {
  const src = (raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!src) return { text: "", think: "" };

  const blocked = stripMatchedBlocks(src);
  if (blocked.think) {
    return blocked;
  }

  const labeled = splitLabeledPreamble(src);
  if (labeled) return labeled;

  return { text: src, think: "" };
}

/**
 * Hard strip for short-explain: never surface chain-of-thought in the float.
 * If the whole payload was thinking, fall back to a short empty-safe note.
 */
export function stripThinkForExplain(raw: string): string {
  const { text, think } = splitThinkContent(raw);
  const out = text.trim();
  if (out) return out;
  // Model only emitted think — do not dump it into the float.
  if (think) return "";
  return "";
}
