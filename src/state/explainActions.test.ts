import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatPort } from "../lib/chat";

const resolvePort = vi.fn();

vi.mock("../lib/chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/chat")>();
  return {
    ...actual,
    resolvePort: (...args: unknown[]) => resolvePort(...args),
  };
});

import { explainSpan } from "./explainActions";

afterEach(() => {
  resolvePort.mockReset();
});

describe("explainSpan", () => {
  it("uses port.explain when available", async () => {
    const port: ChatPort = {
      complete: vi.fn(),
      explain: vi.fn(async () => ({ text: "（MockExplain）函子：说明" })),
    };
    resolvePort.mockResolvedValue(port);

    const text = await explainSpan({ cardId: "c1", span: "函子" });
    expect(text).toBe("（MockExplain）函子：说明");
    expect(port.explain).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: "c1", span: "函子" }),
    );
    expect(port.complete).not.toHaveBeenCalled();
  });

  it("falls back to complete when explain is missing", async () => {
    const port: ChatPort = {
      complete: vi.fn(async () => ({
        text: "fallback gloss",
        marks: [{ term: "x" }],
      })),
    };
    resolvePort.mockResolvedValue(port);

    const text = await explainSpan({ cardId: "c1", span: "范畴" });
    expect(text).toBe("fallback gloss");
    expect(port.complete).toHaveBeenCalledOnce();
    const arg = vi.mocked(port.complete).mock.calls[0]![0];
    expect(arg.messages.some((m) => m.role === "system")).toBe(true);
    expect(arg.messages.some((m) => m.content.includes("范畴"))).toBe(true);
  });

  it("throws on empty span", async () => {
    await expect(explainSpan({ cardId: "c1", span: "  " })).rejects.toThrow(
      /empty span/,
    );
    expect(resolvePort).not.toHaveBeenCalled();
  });

  it("forwards signal to explain", async () => {
    const controller = new AbortController();
    const explain = vi.fn(async () => ({ text: "ok" }));
    resolvePort.mockResolvedValue({ complete: vi.fn(), explain } satisfies ChatPort);

    await explainSpan({
      cardId: "c1",
      span: "term",
      signal: controller.signal,
    });
    expect(explain).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
