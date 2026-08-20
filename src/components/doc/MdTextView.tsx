import { useMemo } from "react";
import { escapeHtml } from "../../lib/chat/port";
import { protectAndRenderMath } from "../../lib/math/tex";
import type { DocKind } from "../../lib/docSession";

type Props = {
  kind: Extract<DocKind, "md" | "text">;
  text: string;
};

const PH_START = "\uE000";
const PH_END = "\uE001";
const PH_ONLY = new RegExp(`^${PH_START}(\\d+)${PH_END}$`);
const PH_GLOBAL = new RegExp(`${PH_START}(\\d+)${PH_END}`, "g");

/**
 * Lightweight safe md subset for the companion pane.
 * Escape → code put → math put → md subset → restore (no wrapMarks; math-katex §2.5).
 */
export function renderDocMd(text: string): string {
  const raw = text.replace(/^\uFEFF/, "");
  if (!raw) return "";

  let s = escapeHtml(raw);
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

    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      blocks.push(`<h${level}>${applyInline(heading[2]!)}</h${level}>`);
      i++;
      continue;
    }

    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i] ?? "")) {
        items.push(`<li>${applyInline((lines[i] ?? "").slice(2))}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

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
      !/^(#{1,3}) /.test(lines[i] ?? "") &&
      !/^[-*] /.test(lines[i] ?? "") &&
      !/^\d+\. /.test(lines[i] ?? "")
    ) {
      para.push(lines[i] ?? "");
      i++;
    }
    blocks.push(`<p>${applyInline(para.join("<br/>"))}</p>`);
  }

  return blocks.join("");
}

export default function MdTextView({ kind, text }: Props) {
  const html = useMemo(
    () => (kind === "md" ? renderDocMd(text) : ""),
    [kind, text],
  );

  if (kind === "text") {
    return <pre className="md-text-view md-text-view--plain">{text}</pre>;
  }

  return (
    <div
      className="md-text-view"
      dangerouslySetInnerHTML={{ __html: html || "<p></p>" }}
    />
  );
}
