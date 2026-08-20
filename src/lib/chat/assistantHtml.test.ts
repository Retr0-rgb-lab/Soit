import { describe, expect, it } from "vitest";
import { renderAssistantHtml } from "./assistantHtml";
import {
  applyMarksHtml,
  completeResultToHtml,
  stripHtml,
  wrapMarksOnEscaped,
  escapeHtml,
} from "./port";

describe("renderAssistantHtml", () => {
  it("escapes script tags (XSS)", () => {
    const html = renderAssistantHtml('<script>alert(1)</script>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders bold **x**", () => {
    const html = renderAssistantHtml("say **x** now");
    expect(html).toContain("<strong>x</strong>");
    expect(html).toMatch(/^<p>/);
  });

  it("renders unordered list", () => {
    const html = renderAssistantHtml("- a\n- b");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<li>b</li>");
  });

  it("renders fenced code", () => {
    const html = renderAssistantHtml("```\nconst a = 1;\n```");
    expect(html).toContain("<pre><code>");
    expect(html).toContain("const a = 1;");
    expect(html).toContain("</code></pre>");
  });

  it("coexists **term** with marks", () => {
    const html = renderAssistantHtml("see **函子** here", [{ term: "函子" }]);
    expect(html).toContain("<strong>");
    expect(html).toContain('class="mark"');
    expect(html).toContain('data-term="函子"');
    // Bold wraps the mark span (marks applied before emphasis).
    expect(html).toContain(
      '<strong><span class="mark" data-term="函子" data-mark-id="函子">函子</span></strong>',
    );
  });

  it("does not mark terms inside fences", () => {
    const html = renderAssistantHtml("outside\n\n```\n函子\n```\n", [
      { term: "函子" },
    ]);
    expect(html).toContain("<pre><code>");
    expect(html).toContain("函子");
    // No mark inside the fence; term only appears as plain code text.
    expect(html).not.toMatch(/<pre><code>[^]*class="mark"/);
    expect(html.match(/class="mark"/g)).toBeNull();
  });

  it("completeResultToHtml delegates and still escapes raw HTML", () => {
    const html = completeResultToHtml({
      text: 'hi <img src=x onerror=alert(1) class="mark">',
      marks: undefined,
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("class=&quot;mark&quot;");
  });

  it("renders inline $a+b$ with katex", () => {
    const html = renderAssistantHtml("see $a+b$ here");
    expect(html).toContain('class="soit-math soit-math-inline"');
    expect(html).toContain('data-tex="a+b"');
    expect(html).toContain("katex");
  });

  it("unescapes $a < b$ before katex", () => {
    const html = renderAssistantHtml("cmp $a < b$ ok");
    expect(html).toContain('class="soit-math soit-math-inline"');
    expect(html).toContain('data-tex="a &lt; b"');
    expect(html).toContain("katex");
    expect(html).not.toContain("soit-math-fallback");
  });

  it("renders display $$…$$ as block outside p", () => {
    const html = renderAssistantHtml("before\n\n$$\\frac{1}{2}$$\n\nafter");
    expect(html).toContain('class="soit-math soit-math-block"');
    expect(html).toContain("katex");
    // Display math must not nest inside <p>…</p>.
    expect(html).not.toMatch(/<p[^>]*>[^<]*<div class="soit-math/);
  });

  it("does not render math inside fenced code", () => {
    const html = renderAssistantHtml("```\n$a$\n```");
    expect(html).toContain("<pre><code>");
    expect(html).toContain("$a$");
    expect(html).not.toContain("soit-math");
  });

  it("does not render math inside inline code", () => {
    const html = renderAssistantHtml("use `$a$` literally");
    expect(html).toContain("<code>$a$</code>");
    expect(html).not.toContain("soit-math");
  });

  it("coexists **bold** with inline math", () => {
    const html = renderAssistantHtml("**bold** and $x$");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('class="soit-math soit-math-inline"');
    expect(html).toContain('data-tex="x"');
    expect(html).toContain("katex");
  });

  it("mark stays outside math shell", () => {
    const html = renderAssistantHtml("term 函子 and $x$", [{ term: "函子" }]);
    expect(html).toContain('class="mark"');
    expect(html).toContain('data-term="函子"');
    expect(html).toContain('class="soit-math soit-math-inline"');
    // Mark must not appear inside the math shell.
    expect(html).not.toMatch(
      /soit-math[^>]*>[\s\S]*class="mark"/,
    );
  });
});

describe("wrapMarksOnEscaped / applyMarksHtml", () => {
  it("wrapMarksOnEscaped does not double-escape", () => {
    const escaped = escapeHtml("a < b and 函子");
    const html = wrapMarksOnEscaped(escaped, [{ term: "函子" }]);
    expect(html).toContain("a &lt; b");
    expect(html).not.toContain("&amp;lt;");
    expect(html).toContain('data-term="函子"');
  });

  it("applyMarksHtml still escapes then wraps", () => {
    const html = applyMarksHtml('<script>x</script> and 函子', [
      { term: "函子" },
    ]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('data-term="函子"');
  });
});

describe("stripHtml", () => {
  it("inserts newlines for li / heading / pre closers", () => {
    expect(stripHtml("<ul><li>a</li><li>b</li></ul>")).toBe("a\nb");
    expect(stripHtml("<h2>Title</h2>body")).toBe("Title\nbody");
    expect(stripHtml("<pre><code>x</code></pre>after")).toBe("x\nafter");
  });

  it("restores inline and display math via data-tex", () => {
    const inline = renderAssistantHtml("see $a+b$ here");
    expect(stripHtml(inline)).toBe("see $a+b$ here");

    const display = renderAssistantHtml("$$\\frac{1}{2}$$");
    expect(stripHtml(display)).toBe("$$\\frac{1}{2}$$");

    const cmp = renderAssistantHtml("cmp $a < b$ ok");
    expect(stripHtml(cmp)).toBe("cmp $a < b$ ok");
  });
});
