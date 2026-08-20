/** ChatPort — single complete path for send + regenerate (Wave C). */

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatMark {
  term: string;
  explanation?: string;
}

export interface ChatCompleteInput {
  cardId: string;
  messages: ChatMessage[];
  /** deepen scope or other card context; opaque to the port */
  scope?: unknown;
  /** Optional abort — ports must honor when provided (Spec §2.1). */
  signal?: AbortSignal;
}

export interface ChatCompleteResult {
  text: string;
  marks?: ChatMark[];
}

export interface ChatPort {
  complete(input: ChatCompleteInput): Promise<ChatCompleteResult>;
}

/** Escape text for safe insertion into HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Wrap mark terms in assistant text as `<span class="mark" data-term="...">`. */
export function applyMarksHtml(
  text: string,
  marks?: ChatMark[],
): string {
  let html = escapeHtml(text);
  if (!marks?.length) return html;

  // Longer terms first so nested substrings do not steal matches.
  const sorted = [...marks]
    .filter((m) => m.term.trim())
    .sort((a, b) => b.term.length - a.term.length);

  for (const m of sorted) {
    const termEsc = escapeHtml(m.term);
    const attr = escapeHtml(m.term);
    const needle = termEsc;
    const idx = html.indexOf(needle);
    if (idx < 0) continue;
    // Skip if already inside a mark tag for this occurrence (simple guard).
    const before = html.slice(0, idx);
    if (before.lastIndexOf('<span class="mark"') > before.lastIndexOf("</span>")) {
      continue;
    }
    const wrapped = `<span class="mark" data-term="${attr}" data-mark-id="${attr}">${termEsc}</span>`;
    html = html.slice(0, idx) + wrapped + html.slice(idx + needle.length);
  }
  return html;
}

/** Turn a port result into aiHtml (paragraph-ish plain + mark spans). */
export function completeResultToHtml(result: ChatCompleteResult): string {
  const raw = result.text.trim();
  if (!raw) return "";
  // Always escape — never trust model text as HTML (XSS via dangerouslySetInnerHTML).
  const withMarks = applyMarksHtml(raw, result.marks);
  // Preserve newlines as <br> for simple multi-line replies.
  return withMarks.replace(/\n/g, "<br>");
}

/** Strip tags for message history fed back into the model. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
