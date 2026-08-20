/** ChatPort — single complete path for send + regenerate (Wave C). */

import { renderAssistantHtml } from "./assistantHtml";

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

/** Short explain input — span/selection gloss; does not write turns or vault. */
export interface ChatExplainInput {
  cardId: string;
  /** Mark term or selection text to explain. */
  span: string;
  /** Optional recent card messages for context (caller assembles). */
  contextMessages?: ChatMessage[];
  /** Optional abort — ports honor when provided (dual-track aligned). */
  signal?: AbortSignal;
}

export interface ChatPort {
  complete(input: ChatCompleteInput): Promise<ChatCompleteResult>;
  /** Short 2–4 sentence explain; no marks required; no persistence. */
  explain?(input: ChatExplainInput): Promise<{ text: string }>;
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

/**
 * Wrap mark terms on already-escaped HTML (first match each, longer first).
 * Does not call escapeHtml on `html` — callers escape once.
 */
export function wrapMarksOnEscaped(
  html: string,
  marks?: ChatMark[],
): string {
  if (!marks?.length) return html;

  // Longer terms first so nested substrings do not steal matches.
  const sorted = [...marks]
    .filter((m) => m.term.trim())
    .sort((a, b) => b.term.length - a.term.length);

  let out = html;
  for (const m of sorted) {
    const termEsc = escapeHtml(m.term);
    const attr = escapeHtml(m.term);
    const needle = termEsc;
    const idx = out.indexOf(needle);
    if (idx < 0) continue;
    const before = out.slice(0, idx);
    // Skip if already inside a mark tag for this occurrence (simple guard).
    if (before.lastIndexOf('<span class="mark"') > before.lastIndexOf("</span>")) {
      continue;
    }
    // Skip match inside an HTML tag / attribute.
    if (before.lastIndexOf("<") > before.lastIndexOf(">")) {
      continue;
    }
    const wrapped = `<span class="mark" data-term="${attr}" data-mark-id="${attr}">${termEsc}</span>`;
    out = out.slice(0, idx) + wrapped + out.slice(idx + needle.length);
  }
  return out;
}

/** Escape plain text then wrap mark terms as `<span class="mark" …>`. */
export function applyMarksHtml(
  text: string,
  marks?: ChatMark[],
): string {
  return wrapMarksOnEscaped(escapeHtml(text), marks);
}

/** Turn a port result into aiHtml (safe md subset + mark spans). */
export function completeResultToHtml(result: ChatCompleteResult): string {
  // Delegate — escape + structure live in renderAssistantHtml (XSS-safe).
  return renderAssistantHtml(result.text, result.marks);
}

/** Strip tags for message history fed back into the model. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-3]>/gi, "\n")
    .replace(/<\/pre>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
