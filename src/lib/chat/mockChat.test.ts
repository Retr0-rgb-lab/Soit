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

  it("emits vault_search tool call when tools on and user asks 搜索", async () => {
    const port = createMockChat();
    const tools = [
      {
        name: "vault_search",
        description: "search",
        parameters: { type: "object", properties: {} },
      },
    ];
    const r = await port.complete({
      cardId: "c1",
      messages: [{ role: "user", content: "搜索 函子" }],
      tools,
      toolChoice: "auto",
    });
    expect(r.toolCalls?.[0]?.name).toBe("vault_search");
    expect(r.text).toBe("");
    const args = JSON.parse(r.toolCalls![0]!.arguments) as { query: string };
    expect(args.query).toContain("函子");
  });

  it("emits fetch_url when message contains http URL", async () => {
    const port = createMockChat();
    const r = await port.complete({
      cardId: "c1",
      messages: [{ role: "user", content: "请读取 https://example.com/a" }],
      tools: [
        {
          name: "fetch_url",
          description: "fetch",
          parameters: { type: "object", properties: {} },
        },
      ],
      toolChoice: "auto",
    });
    expect(r.toolCalls?.[0]?.name).toBe("fetch_url");
    expect(r.toolCalls?.[0]?.arguments).toContain("https://example.com/a");
  });

  it("final hop after tool role uses tool content", async () => {
    const port = createMockChat();
    const r = await port.complete({
      cardId: "c1",
      wireMessages: [
        { role: "user", content: "搜索 函子" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "mock_vault_1",
              type: "function",
              function: {
                name: "vault_search",
                arguments: JSON.stringify({ query: "函子" }),
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "mock_vault_1",
          content: "hit: materials/functor.md",
        },
      ],
    });
    expect(r.toolCalls).toBeUndefined();
    expect(r.text).toContain("已根据工具结果作答");
    expect(r.text).toContain("functor.md");
    expect(r.marks?.some((m) => m.term === "函子")).toBe(true);
  });

  it("toolChoice none never emits toolCalls", async () => {
    const port = createMockChat();
    const r = await port.complete({
      cardId: "c1",
      messages: [{ role: "user", content: "搜索 函子" }],
      tools: [
        {
          name: "vault_search",
          description: "search",
          parameters: { type: "object", properties: {} },
        },
      ],
      toolChoice: "none",
    });
    expect(r.toolCalls).toBeUndefined();
    expect(r.text.length).toBeGreaterThan(0);
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
