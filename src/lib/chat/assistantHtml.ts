/** Safe markdown subset → HTML for assistant turns (Spec card-read-explain §2.1). */

import { protectAndRenderMath } from "../math/tex";
import {
  escapeHtml,
  wrapMarksOnEscaped,
  type ChatMark,
} from "./port";

/** Private-use placeholders — atomic across mark/md passes. */
const PH_START = "\uE000";
const PH_END = "\uE001";
const PH_ONLY = new RegExp(`^${PH_START}(\\d+)${PH_END}$`);
const PH_GLOBAL = new RegExp(`${PH_START}(\\d+)${PH_END}`, "g");

const UL_ITEM = /^\s*[-*] (.+)$/;
const OL_ITEM = /^\s*(\d+)\. (.+)$/;
/** After escapeHtml, `>` becomes `&gt;`. */
const BQ_ITEM = /^(?:&gt;|>) (.+)$/;

/**
 * Model text → trusted HTML for `dangerouslySetInnerHTML`.
 * Pipeline: escape → code protect → math → marks outside code → md subset → restore.
 * Whitelist tags only; never parse model raw HTML.
 */
export function renderAssistantHtml(text: string, marks?: ChatMark[]): string {
  const raw = text.trim();
  if (!raw) return "";

  // A. Escape once.
  let s = escapeHtml(raw);

  // B. Protect fences + inline code (no marks / emphasis / math inside).
  const slots: string[] = [];
  const put = (html: string): string => {
    const i = slots.length;
    slots.push(html);
    return `${PH_START}${i}${PH_END}`;
  };

  s = s.replace(/```[^\n]*\n([\s\S]*?)```/g, (_m, code: string) => {
    const inner = code.replace(/\n$/, "");
    return put(`<pre><code>${inner}</code></pre>`);
  });
  s = s.replace(/`([^`\n]+)`/g, (_m, code: string) =>
    put(`<code>${code}</code>`),
  );

  // C. Math on escaped text (code already in PH slots).
  s = protectAndRenderMath(s, put);

  // D. Marks on escaped text only (outside placeholders).
  s = wrapMarksOnEscaped(s, marks);

  // E. Block + inline subset; skip tag interiors; do not split marks.
  s = applyMdSubset(s);

  s = s.replace(PH_GLOBAL, (_m, n: string) => slots[Number(n)] ?? "");
  return s;
}

function isInsideTag(html: string, offset: number): boolean {
  const before = html.slice(0, offset);
  return before.lastIndexOf("<") > before.lastIndexOf(">");
}

/** Inline: links, **bold**, *italic* — may wrap existing mark spans. */
function applyInline(html: string): string {
  // [label](https://…) → plain label (no free navigation from model text).
  // Prevents leftover "[" clutter while staying XSS-safe (no href).
  let out = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (match, label: string, _url: string, offset: number) => {
      if (isInsideTag(html, offset)) return match;
      return `<span class="ai-link">${label}</span>`;
    },
  );
  // Bare [label] that is not a mark placeholder — drop brackets (common model noise).
  out = out.replace(
    /\[([^\]\n]{1,40})\](?!\()/g,
    (match, label: string, offset: number) => {
      if (isInsideTag(out, offset)) return match;
      // Keep empty / code-like
      if (!String(label).trim()) return match;
      return String(label);
    },
  );

  out = out.replace(
    /\*\*((?:(?!\*\*)[\s\S])+?)\*\*/g,
    (match, inner: string, offset: number) => {
      if (isInsideTag(out, offset)) return match;
      return `<strong>${inner}</strong>`;
    },
  );
  out = out.replace(
    /\*((?:(?!\*)[\s\S])+?)\*/g,
    (match, inner: string, offset: number) => {
      if (isInsideTag(out, offset)) return match;
      return `<em>${inner}</em>`;
    },
  );
  return out;
}

/** Peek past blank lines; return next non-empty index or -1. */
function nextNonEmpty(lines: string[], from: number): number {
  let j = from;
  while (j < lines.length && !lines[j].trim()) j++;
  return j < lines.length ? j : -1;
}

/**
 * Collect list items, allowing a single blank line between items
 * and optional indent (nested "- 例" lines).
 */
function collectList(
  lines: string[],
  start: number,
  kind: "ul" | "ol",
): { html: string; next: number } {
  const items: string[] = [];
  let i = start;
  const itemRe = kind === "ul" ? UL_ITEM : OL_ITEM;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      const n = nextNonEmpty(lines, i + 1);
      if (n >= 0 && itemRe.test(lines[n])) {
        i = n;
        continue;
      }
      break;
    }
    const m = itemRe.exec(line);
    if (!m) break;
    const body = kind === "ul" ? m[1]! : m[2]!;
    items.push(`<li>${applyInline(body)}</li>`);
    i++;
  }

  const tag = kind === "ul" ? "ul" : "ol";
  return { html: `<${tag}>${items.join("")}</${tag}>`, next: i };
}

function collectBlockquote(
  lines: string[],
  start: number,
): { html: string; next: number } {
  const parts: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      const n = nextNonEmpty(lines, i + 1);
      if (n >= 0 && BQ_ITEM.test(lines[n])) {
        i = n;
        continue;
      }
      break;
    }
    const m = BQ_ITEM.exec(line);
    if (!m) break;
    parts.push(applyInline(m[1]!));
    i++;
  }
  return {
    html: `<blockquote>${parts.join("<br>")}</blockquote>`,
    next: i,
  };
}

function isTableRowLine(line: string): boolean {
  const t = line.trim();
  if (!t || !t.includes("|")) return false;
  if (/^\s{0,3}([-*_])\1{2,}\s*$/.test(t)) return false;
  return true;
}

function splitTableCells(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}

function isTableSepLine(line: string): boolean {
  if (!line.includes("|") || !line.includes("-")) return false;
  const cells = splitTableCells(line);
  if (cells.length < 1) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function renderTable(header: string, rows: string[]): string {
  const heads = splitTableCells(header);
  const th = heads.map((c) => `<th>${applyInline(c)}</th>`).join("");
  const trs = rows
    .map((row) => {
      const cells = splitTableCells(row);
      const padded = heads.map((_, i) => cells[i] ?? "");
      return `<tr>${padded.map((c) => `<td>${applyInline(c)}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<div class="ai-table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

function applyMdSubset(s: string): string {
  const lines = s.split("\n");
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fence placeholder occupies its own block line.
    if (PH_ONLY.test(line.trim())) {
      blocks.push(line.trim());
      i++;
      continue;
    }

    // GFM table: header + separator + body
    if (
      isTableRowLine(line) &&
      i + 1 < lines.length &&
      isTableSepLine(lines[i + 1] ?? "")
    ) {
      const header = line;
      i += 2;
      const body: string[] = [];
      while (
        i < lines.length &&
        isTableRowLine(lines[i] ?? "") &&
        !isTableSepLine(lines[i] ?? "")
      ) {
        const L = lines[i] ?? "";
        if (/^#{1,3} /.test(L)) break;
        body.push(L);
        i++;
      }
      blocks.push(renderTable(header, body));
      continue;
    }

    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${applyInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (BQ_ITEM.test(line)) {
      const { html, next } = collectBlockquote(lines, i);
      blocks.push(html);
      i = next;
      continue;
    }

    if (UL_ITEM.test(line)) {
      const { html, next } = collectList(lines, i, "ul");
      blocks.push(html);
      i = next;
      continue;
    }

    if (OL_ITEM.test(line)) {
      const { html, next } = collectList(lines, i, "ol");
      blocks.push(html);
      i = next;
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) break;
      if (/^#{1,3} /.test(l)) break;
      if (UL_ITEM.test(l)) break;
      if (OL_ITEM.test(l)) break;
      if (BQ_ITEM.test(l)) break;
      if (
        isTableRowLine(l) &&
        i + 1 < lines.length &&
        isTableSepLine(lines[i + 1] ?? "")
      ) {
        break;
      }
      if (PH_ONLY.test(l.trim())) break;
      paraLines.push(l);
      i++;
    }
    const body = applyInline(paraLines.join("\n")).replace(/\n/g, "<br>");
    blocks.push(`<p>${body}</p>`);
  }

  return blocks.join("");
}
