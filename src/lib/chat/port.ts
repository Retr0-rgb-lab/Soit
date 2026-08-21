/** ChatPort — complete path for send + regenerate (+ optional tools). */

import { htmlUnescape } from "../math/tex";
import { renderAssistantHtml } from "./assistantHtml";

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Ephemeral OpenAI wire messages for tool loops — never persisted as turns. */
export type ChatWireMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ChatToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatMark {
  term: string;
  explanation?: string;
}

export interface ChatCompleteInput {
  cardId: string;
  /** Plain history (user/assistant/system). Used when wireMessages omitted. */
  messages?: ChatMessage[];
  /** Tool-loop wire history (preferred when set). */
  wireMessages?: ChatWireMessage[];
  /** deepen scope or other card context; opaque to the port */
  scope?: unknown;
  /** Optional abort — ports must honor when provided (Spec §2.1). */
  signal?: AbortSignal;
  tools?: ChatToolDef[];
  toolChoice?: "auto" | "none";
  /** Whether tools are enabled (affects system prompt). */
  toolsEnabled?: boolean;
}

export interface ChatCompleteResult {
  text: string;
  marks?: ChatMark[];
  /** Optional model thinking / chain-of-thought (hidden by default in UI). */
  think?: string;
  toolCalls?: ChatToolCall[];
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

/**
 * Restore KaTeX shells to `$…$` / `$$…$$` via data-tex before generic strip.
 * Walks balanced span/div so nested .katex markup is not truncated.
 */
function restoreMathTex(html: string): string {
  const openRe = /<(span|div)\b([^>]*\bsoit-math\b[^>]*)>/gi;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(html)) !== null) {
    const tag = m[1];
    const attrs = m[2];
    const texMatch = /\bdata-tex="([^"]*)"/.exec(attrs);
    if (!texMatch) continue;

    const start = m.index;
    const afterOpen = start + m[0].length;
    const scanner = new RegExp(`</?${tag}\\b[^>]*>`, "gi");
    scanner.lastIndex = afterOpen;
    let depth = 1;
    let end = -1;
    let sm: RegExpExecArray | null;
    while ((sm = scanner.exec(html)) !== null) {
      if (sm[0].startsWith("</")) {
        depth -= 1;
        if (depth === 0) {
          end = sm.index + sm[0].length;
          break;
        }
      } else if (!sm[0].endsWith("/>")) {
        depth += 1;
      }
    }
    if (end < 0) continue;

    out += html.slice(last, start);
    const tex = htmlUnescape(texMatch[1]);
    out += /\bsoit-math-block\b/.test(attrs) ? `$$${tex}$$` : `$${tex}$`;
    last = end;
    openRe.lastIndex = end;
  }
  out += html.slice(last);
  return out;
}

/** Strip tags for message history fed back into the model. */
export function stripHtml(html: string): string {
  return restoreMathTex(html)
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

/** Plain ChatMessage[] → wire messages. */
export function messagesToWire(messages: ChatMessage[]): ChatWireMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}
