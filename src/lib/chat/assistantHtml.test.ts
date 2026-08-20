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
});
