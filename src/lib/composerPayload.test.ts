import { describe, expect, it } from "vitest";
import {
  buildComposerUserBody,
  formatDocAnchorQuote,
  isProbablyTextFile,
  mentionQueryAt,
  stripMentionToken,
} from "./composerPayload";

describe("formatDocAnchorQuote", () => {
  it("formats path and text without page", () => {
    expect(
      formatDocAnchorQuote({ path: "notes/a.md", text: "选中的句子" }),
    ).toBe("（notes/a.md）\n选中的句子");
  });

  it("includes page when present", () => {
    expect(
      formatDocAnchorQuote({
        path: "papers/x.pdf",
        page: 12,
        text: "lemma",
      }),
    ).toBe("（papers/x.pdf p.12）\nlemma");
  });

  it("treats page 0 as present", () => {
    expect(
      formatDocAnchorQuote({ path: "a.pdf", page: 0, text: "cover" }),
    ).toBe("（a.pdf p.0）\ncover");
  });
});

describe("buildComposerUserBody", () => {
  it("joins quote, refs, attachments, and text", () => {
    const body = buildComposerUserBody({
      text: "请结合上面继续",
      quote: "原句",
      cardRefs: [{ id: "c1", title: "函子", snippet: "映射对象" }],
      attachments: [
        {
          id: "a1",
          name: "note.md",
          mime: "text/markdown",
          size: 12,
          text: "hello",
        },
      ],
    });
    expect(body).toContain("> 原句");
    expect(body).toContain("[引用卡片]");
    expect(body).toContain("函子");
    expect(body).toContain("c1");
    expect(body).toContain("[附件]");
    expect(body).toContain("hello");
    expect(body).toContain("请结合上面继续");
  });

  it("allows send with only attachment", () => {
    const body = buildComposerUserBody({
      text: "",
      attachments: [
        { id: "a1", name: "a.txt", mime: "text/plain", size: 1, text: "x" },
      ],
    });
    expect(body).toContain("a.txt");
  });
});

describe("mentionQueryAt", () => {
  it("detects @ at end", () => {
    expect(mentionQueryAt("看 @函", 4)).toEqual({ start: 2, query: "函" });
  });

  it("strips token", () => {
    const r = stripMentionToken("看 @函 子", 2, 4);
    expect(r.value).toBe("看  子");
    expect(r.cursor).toBe(2);
  });
});

describe("isProbablyTextFile", () => {
  it("accepts md and rejects png by ext", () => {
    expect(isProbablyTextFile("a.md", "")).toBe(true);
    expect(isProbablyTextFile("a.png", "image/png")).toBe(false);
  });
});
