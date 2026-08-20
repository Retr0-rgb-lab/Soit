import { describe, expect, it } from "vitest";
import { renderDocMd } from "./MdTextView";

describe("renderDocMd math", () => {
  it("renders inline $x$ with katex", () => {
    const html = renderDocMd("see $x$ here");
    expect(html).toContain('class="soit-math soit-math-inline"');
    expect(html).toContain("katex");
    expect(html).not.toContain("$x$");
  });

  it("renders display $$…$$ as block outside p", () => {
    const html = renderDocMd("before\n\n$$\\frac{1}{2}$$\n\nafter");
    expect(html).toContain('class="soit-math soit-math-block"');
    expect(html).toContain("katex");
    // PH_ONLY keeps display math as a sibling block, not nested in <p>
    expect(html).not.toMatch(/<p[^>]*>[^<]*<div class="soit-math soit-math-block"/);
    expect(html).toContain("</p><div class=\"soit-math soit-math-block\"");
  });

  it("does not math-render $ inside code fences", () => {
    const html = renderDocMd("```\n$a$\n```");
    expect(html).toContain("<pre><code>");
    expect(html).not.toContain("soit-math");
  });
});
