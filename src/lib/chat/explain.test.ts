import { describe, expect, it, vi, afterEach } from "vitest";
import { createMockChat } from "./mockChat";
import { createOpenAICompatChat } from "./openaiCompat";
import { DEFAULT_CHAT_CONFIG } from "./config";

describe("MockChat.explain", () => {
  it("returns text starting with （MockExplain）", async () => {
    const port = createMockChat();
    const result = await port.explain!({
      cardId: "c1",
      span: "函子",
    });
    expect(result.text.startsWith("（MockExplain）")).toBe(true);
    expect(result.text).toContain("函子");
  });

  it("does not only echo bare glossary-style static table", async () => {
    const port = createMockChat();
    const result = await port.explain!({
      cardId: "c1",
      span: "函子",
    });
    // Must be more than a plain glossary line — prefix distinguishes live explain path.
    expect(result.text).toMatch(/^（MockExplain）/);
    expect(result.text.length).toBeGreaterThan("（MockExplain）函子：".length + 8);
  });

  it("explains unknown spans without throwing", async () => {
    const port = createMockChat();
    const result = await port.explain!({
      cardId: "c1",
      span: "量子纠缠",
    });
    expect(result.text.startsWith("（MockExplain）")).toBe(true);
    expect(result.text).toContain("量子纠缠");
  });

  it("aborts when signal fires during delay", async () => {
    const port = createMockChat();
    const controller = new AbortController();
    const pending = port.explain!({
      cardId: "c1",
      span: "abort me",
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("OpenAICompatChat.explain", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends short system, low temperature, and truncates span/output", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        temperature?: number;
        messages?: Array<{ role: string; content: string }>;
      };
      expect(body.temperature).toBe(0.3);
      expect(body.messages?.[0]?.role).toBe("system");
      expect(body.messages?.[0]?.content).toMatch(/2–4 句|短解释/);
      const userMsg = body.messages?.find((m) => m.role === "user");
      expect(userMsg?.content.length).toBeLessThanOrEqual(500 + 40);
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "x".repeat(1200),
              },
            },
          ],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const port = createOpenAICompatChat({
      ...DEFAULT_CHAT_CONFIG,
      apiKey: "sk-test",
      baseUrl: "https://example.test/v1",
      model: "gpt-test",
    });
    const longSpan = "词".repeat(600);
    const result = await port.explain!({
      cardId: "c1",
      span: longSpan,
    });
    expect(result.text.length).toBeLessThanOrEqual(800);
    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeUndefined();
  });

  it("passes AbortSignal to fetch when provided", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "短解释正文。" } }],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const port = createOpenAICompatChat({
      ...DEFAULT_CHAT_CONFIG,
      apiKey: "sk-test",
      baseUrl: "https://example.test/v1",
    });
    const result = await port.explain!({
      cardId: "c1",
      span: "范畴",
      signal: controller.signal,
    });
    expect(result.text).toBe("短解释正文。");
  });
});
