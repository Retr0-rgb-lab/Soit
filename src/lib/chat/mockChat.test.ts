import { describe, expect, it } from "vitest";
import { applyMarksHtml, completeResultToHtml } from "./port";
import { createMockChat } from "./mockChat";
import { parseAssistantContent } from "./openaiCompat";
import { portFromConfig, portKindFromConfig } from "./index";
import { DEFAULT_CHAT_CONFIG } from "./config";

describe("MockChat", () => {
  it("returns text and structured marks", async () => {
    const port = createMockChat();
    const result = await port.complete({
      cardId: "c1",
      messages: [{ role: "user", content: "函子是什么？" }],
    });
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.marks?.some((m) => m.term === "函子")).toBe(true);
  });

  it("aborts when signal fires during delay", async () => {
    const port = createMockChat();
    const controller = new AbortController();
    const pending = port.complete({
      cardId: "c1",
      messages: [{ role: "user", content: "abort me" }],
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("applyMarksHtml wraps terms as mark spans", async () => {
    const port = createMockChat();
    const result = await port.complete({
      cardId: "c1",
      messages: [{ role: "user", content: "讲讲范畴与函子" }],
    });
    const html = completeResultToHtml(result);
    expect(html).toContain('class="mark"');
    expect(html).toContain('data-term="函子"');
  });

  it("applyMarksHtml escapes raw text", () => {
    const html = applyMarksHtml('<script>x</script> and 函子', [
      { term: "函子" },
    ]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('data-term="函子"');
  });

  it("completeResultToHtml never trusts raw class=mark substrings", () => {
    const html = completeResultToHtml({
      text: 'hi <img src=x onerror=alert(1) class="mark">',
      marks: undefined,
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    // Attribute quotes are escaped — no executable markup path.
    expect(html).toContain("class=&quot;mark&quot;");
  });
});

describe("openaiCompat parse", () => {
  it("extracts [[term]] marks", () => {
    const r = parseAssistantContent("先看 [[函子]] 再看 [[范畴]]。");
    expect(r.text).toBe("先看 函子 再看 范畴。");
    expect(r.marks?.map((m) => m.term)).toEqual(["函子", "范畴"]);
  });
});

describe("resolvePort / config", () => {
  it("uses mock when apiKey empty", () => {
    expect(portKindFromConfig(DEFAULT_CHAT_CONFIG)).toBe("mock");
    expect(portFromConfig(DEFAULT_CHAT_CONFIG).constructor.name).toBe(
      "MockChat",
    );
  });

  it("uses openai when apiKey set", () => {
    const cfg = {
      ...DEFAULT_CHAT_CONFIG,
      apiKey: "sk-test",
    };
    expect(portKindFromConfig(cfg)).toBe("openai");
    expect(portFromConfig(cfg).constructor.name).toBe("OpenAICompatChat");
  });
});
