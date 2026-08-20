/** Safe markdown subset → HTML for assistant turns (Spec card-read-explain §2.1). */

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

/**
 * Model text → trusted HTML for `dangerouslySetInnerHTML`.
 * Pipeline: escape → code protect → marks outside code → md subset → restore.
 * Whitelist tags only; never parse model raw HTML.
 */
export function renderAssistantHtml(text: string, marks?: ChatMark[]): string {
  const raw = text.trim();
  if (!raw) return "";

  // A. Escape once.
  let s = escapeHtml(raw);

  // B. Protect fences + inline code (no marks / emphasis inside).
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
  s = s.replace(/`([^`\n]+)`/g, (_m, code: string) => put(`<code>${code}</code>`));

  // C. Marks on escaped text only (outside placeholders).
  s = wrapMarksOnEscaped(s, marks);

  // D. Block + inline subset; skip tag interiors; do not split marks.
  s = applyMdSubset(s);

  s = s.replace(PH_GLOBAL, (_m, n: string) => slots[Number(n)] ?? "");
  return s;
}

function isInsideTag(html: string, offset: number): boolean {
  const before = html.slice(0, offset);
  return before.lastIndexOf("<") > before.lastIndexOf(">");
}

/** `**bold**` then `*italic*` on text; may wrap existing mark spans. */
function applyInline(html: string): string {
  let out = html.replace(
    /\*\*((?:(?!\*\*)[\s\S])+?)\*\*/g,
    (match, inner: string, offset: number) => {
      if (isInsideTag(html, offset)) return match;
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

    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${applyInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(`<li>${applyInline(lines[i].slice(2))}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(`<li>${applyInline(lines[i].replace(/^\d+\. /, ""))}</li>`);
        i++;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) break;
      if (/^#{1,3} /.test(l)) break;
      if (/^[-*] /.test(l)) break;
      if (/^\d+\. /.test(l)) break;
      if (PH_ONLY.test(l.trim())) break;
      paraLines.push(l);
      i++;
    }
    const body = applyInline(paraLines.join("\n")).replace(/\n/g, "<br>");
    blocks.push(`<p>${body}</p>`);
  }

  return blocks.join("");
}
