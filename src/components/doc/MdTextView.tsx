import { useEffect, useMemo, useRef } from "react";
import { escapeHtml } from "../../lib/chat/port";
import { protectAndRenderMath } from "../../lib/math/tex";
import { renderMermaidBlocks } from "../../lib/mermaid";
import type { DocKind } from "../../lib/docSession";

type Props = {
  kind: Extract<DocKind, "md" | "text">;
  text: string;
  /** Optional path — forces md pipeline when extension is .md/.markdown. */
  pathHint?: string;
};

const PH_START = "\uE000";
const PH_END = "\uE001";
const PH_ONLY = new RegExp(`^${PH_START}(\\d+)${PH_END}$`);
const PH_GLOBAL = new RegExp(`${PH_START}(\\d+)${PH_END}`, "g");

/** True when path or content should use markdown pipeline (PEL-156). */
export function shouldRenderAsMarkdown(
  kind: string,
  text: string,
  pathHint?: string,
): boolean {
  const path = (pathHint ?? "").replace(/\\/g, "/").toLowerCase();
  if (path.endsWith(".md") || path.endsWith(".markdown") || path.endsWith(".mdx")) {
    return true;
  }
  if (kind === "md") return true;
  // Heuristic: plain-text probe mis-tagged files that are clearly markdown.
  const sample = (text ?? "").slice(0, 4000);
  if (!sample.trim()) return false;
  const signals =
    /(^|\n)\s{0,3}#{1,6}\s+\S/.test(sample) ||
    /(^|\n)\s{0,3}[-*+]\s+\S/.test(sample) ||
    /(^|\n)\s{0,3}\d+\.\s+\S/.test(sample) ||
    /(^|\n)```/.test(sample) ||
    /\*\*[^*\n]+\*\*/.test(sample) ||
    /(^|\n)\s{0,3}>\s+\S/.test(sample);
  return signals;
}

/**
 * Lightweight safe md subset for the companion pane.
 * Escape → code put → math put → md subset → restore (no wrapMarks; math-katex §2.5).
 */
export function renderDocMd(text: string): string {
  // Normalize Windows / old-Mac newlines so block regexes match.
  const raw = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!raw) return "";

  let s = escapeHtml(raw);
  const slots: string[] = [];
  const put = (html: string): string => {
    const i = slots.length;
    slots.push(html);
    return `${PH_START}${i}${PH_END}`;
  };

  s = s.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_m, lang: string, code: string) => {
    const inner = code.replace(/\n$/, "");
    if ((lang ?? "").trim().toLowerCase() === "mermaid") {
      return put(`<div class="soit-mermaid">${inner}</div>`);
    }
    return put(`<pre><code>${inner}</code></pre>`);
  });
  s = s.replace(/`([^`\n]+)`/g, (_m, code: string) =>
    put(`<code>${code}</code>`),
  );

  s = protectAndRenderMath(s, put);

  s = applyDocMdSubset(s);
  s = s.replace(PH_GLOBAL, (_m, n: string) => slots[Number(n)] ?? "");
  return s;
}

function isInsideTag(html: string, offset: number): boolean {
  const before = html.slice(0, offset);
  return before.lastIndexOf("<") > before.lastIndexOf(">");
}

function applyInline(html: string): string {
  // Links [label](url) — block javascript:/data:; allow http(s) + relative vault paths.
  let out = html.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (match, label: string, href: string, offset: number) => {
      if (isInsideTag(html, offset)) return match;
      const h = href.trim();
      if (!h || /^(javascript:|data:|vbscript:)/i.test(h)) return match;
      return `<a href="${h}" rel="noreferrer noopener">${label}</a>`;
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
    /__((?:(?!__)[\s\S])+?)__/g,
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
  out = out.replace(
    /_((?:(?!_)[\s\S])+?)_/g,
    (match, inner: string, offset: number) => {
      if (isInsideTag(out, offset)) return match;
      // Avoid matching snake_case identifiers mid-word
      if (/[A-Za-z0-9]$/.test(out.slice(0, offset))) return match;
      return `<em>${inner}</em>`;
    },
  );
  return out;
}

/** GFM table row: has `|` and is not only a fence. */
function isTableRowLine(line: string): boolean {
  const t = line.trim();
  if (!t || !t.includes("|")) return false;
  // Avoid treating bare HR as table
  if (/^\s{0,3}([-*_])\1{2,}\s*$/.test(t)) return false;
  return true;
}

function splitTableCells(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}

/** GFM separator row: each cell is --- / :--- / ---: / :---: */
function isTableSepLine(line: string): boolean {
  if (!line.includes("|") || !line.includes("-")) return false;
  const cells = splitTableCells(line);
  if (cells.length < 1) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function renderTable(header: string, rows: string[]): string {
  const heads = splitTableCells(header);
  const bodyRows = rows.map(splitTableCells);
  const th = heads
    .map((c) => `<th>${applyInline(c)}</th>`)
    .join("");
  const trs = bodyRows
    .map((cells) => {
      // Pad / trim to header width for ragged rows
      const padded = heads.map((_, i) => cells[i] ?? "");
      return `<tr>${padded.map((c) => `<td>${applyInline(c)}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<div class="md-table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

function applyDocMdSubset(s: string): string {
  const lines = s.split("\n");
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i++;
      continue;
    }

    if (PH_ONLY.test(line.trim())) {
      blocks.push(line.trim());
      i++;
      continue;
    }

    // GFM table: header + separator + body rows (PEL-156 — common in imported notes)
    if (
      isTableRowLine(line) &&
      i + 1 < lines.length &&
      isTableSepLine(lines[i + 1] ?? "")
    ) {
      const header = line;
      i += 2; // skip header + sep
      const body: string[] = [];
      while (i < lines.length && isTableRowLine(lines[i] ?? "") && !isTableSepLine(lines[i] ?? "")) {
        // Stop if next block type starts (heading etc.) — still pipe-ish lines continue table
        const L = lines[i] ?? "";
        if (/^(#{1,6})\s+/.test(L)) break;
        body.push(L);
        i++;
      }
      blocks.push(renderTable(header, body));
      continue;
    }

    // Horizontal rule
    if (/^\s{0,3}([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push("<hr/>");
      i++;
      continue;
    }

    // ATX heading: allow optional space after # (Obsidian / loose md)
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1]!.length, 3);
      blocks.push(`<h${level}>${applyInline(heading[2]!)}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote (after escapeHtml, leading `>` is `&gt;`)
    if (/^(&gt;|>)\s?/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^(&gt;|>)\s?/.test(lines[i] ?? "")) {
        q.push((lines[i] ?? "").replace(/^(&gt;|>)\s?/, ""));
        i++;
      }
      blocks.push(`<blockquote>${applyInline(q.join("<br/>"))}</blockquote>`);
      continue;
    }

    // Unordered list (- * +)
    if (/^[-*+] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+] /.test(lines[i] ?? "")) {
        items.push(`<li>${applyInline((lines[i] ?? "").slice(2))}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i] ?? "")) {
        items.push(
          `<li>${applyInline((lines[i] ?? "").replace(/^\d+\. /, ""))}</li>`,
        );
        i++;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() &&
      !PH_ONLY.test((lines[i] ?? "").trim()) &&
      !/^(#{1,6})\s+/.test(lines[i] ?? "") &&
      !/^[-*+] /.test(lines[i] ?? "") &&
      !/^\d+\. /.test(lines[i] ?? "") &&
      !/^(&gt;|>)\s?/.test(lines[i] ?? "") &&
      !/^\s{0,3}([-*_])\1{2,}\s*$/.test(lines[i] ?? "") &&
      // Don't swallow the start of a GFM table into a paragraph
      !(
        isTableRowLine(lines[i] ?? "") &&
        i + 1 < lines.length &&
        isTableSepLine(lines[i + 1] ?? "")
      )
    ) {
      para.push(lines[i] ?? "");
      i++;
    }
    blocks.push(`<p>${applyInline(para.join("<br/>"))}</p>`);
  }

  return blocks.join("");
}

export default function MdTextView({ kind, text, pathHint }: Props) {
  const asMd = shouldRenderAsMarkdown(kind, text, pathHint);
  const html = useMemo(
    () => (asMd ? renderDocMd(text) : ""),
    [asMd, text],
  );
  const mdRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mdRef.current) void renderMermaidBlocks(mdRef.current);
  }, [html]);

  if (!asMd) {
    return <pre className="md-text-view md-text-view--plain">{text}</pre>;
  }

  return (
    <div
      ref={mdRef}
      className="md-text-view md-text-view--md"
      data-kind={kind}
      dangerouslySetInnerHTML={{
        __html: html || "<p class=\"md-empty\">（空文档）</p>",
      }}
    />
  );
}
