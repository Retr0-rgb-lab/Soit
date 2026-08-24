import { describe, expect, it } from "vitest";
import { renderDocMd, shouldRenderAsMarkdown } from "./MdTextView";

describe("renderDocMd formats", () => {
  it("renders CRLF headings, bold, and lists", () => {
    const html = renderDocMd(
      "# Title\r\n\r\n**bold** text\r\n\r\n- a\r\n- b\r\n",
    );
    expect(html).toContain("<h1>");
    expect(html).toContain("Title");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>");
  });

  it("heading then paragraph without blank line", () => {
    const html = renderDocMd("# Title\npara");
    expect(html).toContain("<h1>");
    expect(html).toContain("<p>");
    expect(html).toContain("para");
  });

  it("blockquotes and hr", () => {
    const html = renderDocMd("> quote line\n\n---\n\nnext");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<hr");
  });

  it("links stay escaped-safe", () => {
    const html = renderDocMd("see [docs](https://example.com/a)");
    expect(html).toContain('<a href="https://example.com/a"');
    expect(html).toContain("docs");
  });

  it("renders GFM pipe tables (imported README style)", () => {
    const md = [
      "# 报告",
      "",
      "| 文件 | 说明 |",
      "|---|---|",
      "| [a.md](./a.md) | 主报告 |",
      "| b.md | 短版 |",
      "",
      "尾段",
    ].join("\n");
    const html = renderDocMd(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>");
    expect(html).toContain("<td>");
    expect(html).not.toMatch(/\|---\|/);
    expect(html).toContain('href="./a.md"');
    expect(html).toContain("尾段");
  });

  it("renders mermaid fence as diagram placeholder", () => {
    const html = renderDocMd("```mermaid\ngraph TD; A-->B;\n```");
    expect(html).toContain('class="soit-mermaid"');
    expect(html).toContain("A--&gt;B");
    expect(html).not.toContain("<pre><code>graph");
  });
});

describe("shouldRenderAsMarkdown", () => {
  it("forces md for .md path even when kind is text", () => {
    expect(shouldRenderAsMarkdown("text", "hello", "materials/note.md")).toBe(
      true,
    );
  });

  it("detects markdown heuristics in plain text kind", () => {
    expect(
      shouldRenderAsMarkdown("text", "# Hello\n\n- item\n", "note.txt"),
    ).toBe(true);
  });

  it("keeps pure prose as plain", () => {
    expect(
      shouldRenderAsMarkdown("text", "just a plain note without markup", "a.txt"),
    ).toBe(false);
  });
});
