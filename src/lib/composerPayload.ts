/** Compose user message body with quote, card refs, and attachments. */

export type ComposerCardRef = {
  id: string;
  title: string;
  /** Optional plain-text snippet from the referenced card. */
  snippet?: string;
};

/** Doc-companion selection anchor → single composer quote (PEL-156). */
export type DocAnchor = {
  path: string;
  text: string;
  page?: number;
};

/** Format one quote string; feed into buildComposerUserBody via `quote`. */
export function formatDocAnchorQuote(a: DocAnchor): string {
  const loc = a.page != null ? `${a.path} p.${a.page}` : a.path;
  return `（${loc}）\n${a.text}`;
}

export type ComposerAttachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Inlined text when readable; omitted for binary. */
  text?: string;
};

export const ATTACH_MAX_FILES = 5;
export const ATTACH_MAX_BYTES = 2 * 1024 * 1024;
/** Cap inlined text per file in the outgoing message. */
export const ATTACH_TEXT_CAP = 12_000;
export const CARD_SNIPPET_CAP = 600;

const TEXT_EXT = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "css",
  "html",
  "htm",
  "xml",
  "yml",
  "yaml",
  "toml",
  "rs",
  "py",
  "go",
  "java",
  "kt",
  "swift",
  "c",
  "h",
  "cpp",
  "hpp",
  "sql",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "log",
  "env",
  "ini",
  "cfg",
  "conf",
]);

export function isProbablyTextFile(name: string, mime: string): boolean {
  if (mime.startsWith("text/")) return true;
  if (
    mime === "application/json" ||
    mime === "application/xml" ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml")
  ) {
    return true;
  }
  const ext = name.includes(".")
    ? name.slice(name.lastIndexOf(".") + 1).toLowerCase()
    : "";
  return TEXT_EXT.has(ext);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Build the user turn body sent to Host / ChatPort.
 * Order: quote → card refs → attachments → user text.
 */
export function buildComposerUserBody(input: {
  text: string;
  quote?: string;
  cardRefs?: ComposerCardRef[];
  attachments?: ComposerAttachment[];
}): string {
  const parts: string[] = [];
  const quote = input.quote?.trim();
  if (quote) {
    parts.push(`> ${quote}`);
  }

  const refs = input.cardRefs ?? [];
  if (refs.length > 0) {
    const lines = ["[引用卡片]"];
    for (const r of refs) {
      lines.push(`- 「${r.title}」（${r.id}）`);
      const sn = r.snippet?.trim();
      if (sn) {
        const clipped =
          sn.length > CARD_SNIPPET_CAP
            ? `${sn.slice(0, CARD_SNIPPET_CAP)}…`
            : sn;
        for (const line of clipped.split("\n")) {
          lines.push(`  ${line}`);
        }
      }
    }
    parts.push(lines.join("\n"));
  }

  const atts = input.attachments ?? [];
  if (atts.length > 0) {
    const blocks: string[] = ["[附件]"];
    for (const a of atts) {
      const meta = `${a.name} · ${formatBytes(a.size)}${a.mime ? ` · ${a.mime}` : ""}`;
      if (a.text != null && a.text.length > 0) {
        const body =
          a.text.length > ATTACH_TEXT_CAP
            ? `${a.text.slice(0, ATTACH_TEXT_CAP)}\n…(截断)`
            : a.text;
        blocks.push(`--- ${meta} ---\n${body}`);
      } else {
        blocks.push(`- ${meta}（未内联正文，仅文件名）`);
      }
    }
    parts.push(blocks.join("\n\n"));
  }

  const text = input.text.trim();
  if (text) parts.push(text);

  return parts.join("\n\n").trim();
}

/** Detect trailing `@query` at cursor for mention UI. */
export function mentionQueryAt(
  value: string,
  cursor: number,
): { start: number; query: string } | null {
  const head = value.slice(0, Math.max(0, cursor));
  const m = head.match(/(^|[\s([{（【])@([^\s@]*)$/);
  if (!m || m.index == null) return null;
  const at = m.index + m[1]!.length;
  return { start: at, query: m[2] ?? "" };
}

/** Remove `@query` span and return new value + cursor after deletion. */
export function stripMentionToken(
  value: string,
  start: number,
  cursor: number,
): { value: string; cursor: number } {
  const before = value.slice(0, start);
  const after = value.slice(cursor);
  return { value: before + after, cursor: before.length };
}
