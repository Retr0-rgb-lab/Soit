import { describe, expect, it } from "vitest";
import { attrEscape, htmlUnescape, protectAndRenderMath } from "./tex";

const PH_START = "\uE000";
const PH_END = "\uE001";

function withSlots(input: string): { out: string; slots: string[] } {
  const slots: string[] = [];
  const put = (html: string): string => {
    const i = slots.length;
    slots.push(html);
    return `${PH_START}${i}${PH_END}`;
  };
  return { out: protectAndRenderMath(input, put), slots };
}

describe("htmlUnescape / attrEscape", () => {
  it("round-trips common entities", () => {
    expect(htmlUnescape("a &lt; b &amp; c &gt; &quot;x&#39;")).toBe('a < b & c > "x\'');
  });

  it("attrEscape quotes and angles", () => {
    expect(attrEscape('a<"b">')).toBe("a&lt;&quot;b&quot;&gt;");
  });
});

describe("protectAndRenderMath", () => {
  it("renders inline $a+b$", () => {
    const { out, slots } = withSlots("see $a+b$ here");
    expect(out).toMatch(new RegExp(`${PH_START}0${PH_END}`));
    expect(slots[0]).toContain('class="soit-math soit-math-inline"');
    expect(slots[0]).toContain('data-tex="a+b"');
    expect(slots[0]).toContain("katex");
  });

  it("unescapes $a < b$ before katex", () => {
    // Caller already ran escapeHtml, so body is a &lt; b.
    const { slots } = withSlots("cmp $a &lt; b$ ok");
    expect(slots[0]).toContain('class="soit-math soit-math-inline"');
    expect(slots[0]).toContain('data-tex="a &lt; b"');
    expect(slots[0]).toContain("katex");
    expect(slots[0]).not.toContain("soit-math-fallback");
  });

  it("renders display $$…$$ on own lines", () => {
    const { out, slots } = withSlots("before\n$$\\frac{1}{2}$$\nafter");
    expect(slots[0]).toContain('class="soit-math soit-math-block"');
    expect(slots[0]).toContain("katex");
    expect(slots[0]).toContain('data-tex="\\frac{1}{2}"');
    // PH sits on its own line for PH_ONLY consumers.
    expect(out).toContain(`\n${PH_START}0${PH_END}\n`);
  });

  it("skips existing code placeholders that contain $a$", () => {
    const codePh = `${PH_START}0${PH_END}`;
    const slots: string[] = [`<code>$a$</code>`];
    const put = (html: string): string => {
      const i = slots.length;
      slots.push(html);
      return `${PH_START}${i}${PH_END}`;
    };
    const out = protectAndRenderMath(`code ${codePh} and $x$`, put);
    // Only the outer $x$ becomes math; code PH is untouched.
    expect(out).toContain(codePh);
    expect(slots[0]).toBe("<code>$a$</code>");
    expect(slots.length).toBe(2);
    expect(slots[1]).toContain("soit-math-inline");
    expect(slots[1]).toContain('data-tex="x"');
  });

  it("bad tex falls back without throwing", () => {
    expect(() => withSlots("$\\invalid{ $")).not.toThrow();
    const { slots } = withSlots("$\\begin{neverclosed$");
    expect(slots.some((h) => h.includes("soit-math-fallback"))).toBe(true);
    expect(slots.every((h) => !h.includes("katex-error"))).toBe(true);
  });

  // Currency: bare `$12` may false-positive (P0 allows; no heuristic).
  it("documents that $12 may false-positive", () => {
    const { slots } = withSlots("price $12");
    // Implementation may or may not match unpaired $; either is OK for P0.
    void slots;
    expect(true).toBe(true);
  });
});
