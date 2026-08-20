/** Shared KaTeX protect/render for assistant + doc md pipelines (math-katex Spec §2.3). */

import katex from "katex";

const PH_START = "\uE000";
const PH_END = "\uE001";
/** Match existing code placeholders so math never scans inside them. */
const PH_TOKEN = new RegExp(`${PH_START}\\d+${PH_END}`, "g");

const KATEX_OPTS_BASE = {
  throwOnError: true as const,
  strict: "ignore" as const,
  output: "html" as const,
};

/** Inverse of escapeHtml for entities that appear inside already-escaped tex. */
export function htmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Escape a string for use inside a double-quoted HTML attribute. */
export function attrEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderKatexOrFallback(
  tex: string,
  displayMode: boolean,
  put: (html: string) => string,
): string {
  try {
    const katexHtml = katex.renderToString(tex, {
      ...KATEX_OPTS_BASE,
      displayMode,
    });
    const attr = attrEscape(tex);
    if (displayMode) {
      return put(
        `<div class="soit-math soit-math-block" data-tex="${attr}">${katexHtml}</div>`,
      );
    }
    return put(
      `<span class="soit-math soit-math-inline" data-tex="${attr}">${katexHtml}</span>`,
    );
  } catch {
    return put(`<code class="soit-math-fallback">${escapeHtml(tex)}</code>`);
  }
}

/**
 * Match math on already-escaped text whose code regions are PH tokens.
 * Caller owns slots via the same put() used for code fences
 * (PH_START=\uE000, PH_END=\uE001). Never invent a second PH namespace.
 */
export function protectAndRenderMath(
  escapedWithCodePlaceholders: string,
  put: (html: string) => string,
  _opts?: Record<string, never>,
): string {
  // Split on existing placeholders so we never rewrite code slots.
  const parts: string[] = [];
  let last = 0;
  const re = new RegExp(PH_TOKEN.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(escapedWithCodePlaceholders)) !== null) {
    if (m.index > last) {
      parts.push(renderMathInSegment(escapedWithCodePlaceholders.slice(last, m.index), put));
    }
    parts.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < escapedWithCodePlaceholders.length) {
    parts.push(renderMathInSegment(escapedWithCodePlaceholders.slice(last), put));
  }
  return parts.join("");
}

function renderMathInSegment(segment: string, put: (html: string) => string): string {
  if (!segment) return segment;

  // 1. Display $$…$$ (multiline OK), left-to-right non-overlapping.
  let s = segment.replace(/\$\$([\s\S]+?)\$\$/g, (full, body: string) => {
    const tex = htmlUnescape(body.trim());
    if (!tex) return full;
    const ph = renderKatexOrFallback(tex, true, put);
    // Own lines so PH_ONLY md consumers treat display math like fences.
    return `\n${ph}\n`;
  });

  // 2. Inline $…$ same line only; empty body kept as source.
  // Note: bare `$12` may false-positive (P0 allows; no currency heuristic).
  s = s.replace(/\$([^\$\n]+?)\$/g, (full, body: string) => {
    const tex = htmlUnescape(body.trim());
    if (!tex) return full;
    return renderKatexOrFallback(tex, false, put);
  });

  return s;
}
