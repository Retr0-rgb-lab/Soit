/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Composer from "./Composer";

const hostMocks = vi.hoisted(() => ({
  getModelSettings: vi.fn(),
  getChatConfig: vi.fn(),
  setModelSettings: vi.fn(),
  getToolsPrefs: vi.fn(),
  setToolsPrefs: vi.fn(),
}));

vi.mock("../../lib/host", () => hostMocks);

afterEach(cleanup);

function makePrefs(over: Record<string, unknown> = {}) {
  return {
    version: 1,
    toolsEnabled: true,
    maxToolRounds: 3,
    webSearchBackend: "off",
    webSearchEnabled: false,
    tavilyApiKey: "",
    allowLoopbackFetch: false,
    ...over,
  };
}

beforeEach(() => {
  hostMocks.getModelSettings.mockResolvedValue({
    version: 1,
    providers: [],
    models: [],
    activeModelId: null,
    explainModelId: null,
  });
  hostMocks.getChatConfig.mockResolvedValue({
    model: "",
    baseUrl: "",
    apiKey: "",
  });
  hostMocks.getToolsPrefs.mockResolvedValue(makePrefs());
  hostMocks.setToolsPrefs.mockImplementation(async (p: unknown) => p);
});

function renderComposer() {
  render(
    <Composer
      draft=""
      quote=""
      onDraftChange={() => undefined}
      onClearQuote={() => undefined}
      onSend={() => undefined}
    />,
  );
}

describe("Composer web search toggle", () => {
  it("starts off with pressed=false and off tooltip", async () => {
    renderComposer();
    const btn = await screen.findByRole("button", { name: "开启网页搜索" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.getAttribute("data-tip")).toContain("关");
  });

  it("toggles on: writes fresh prefs and sets pressed=true", async () => {
    renderComposer();
    const btn = await screen.findByRole("button", { name: "开启网页搜索" });
    fireEvent.click(btn);
    await vi.waitFor(() => {
      expect(hostMocks.setToolsPrefs).toHaveBeenCalledTimes(1);
    });
    const arg = hostMocks.setToolsPrefs.mock.calls[0]![0] as {
      webSearchEnabled: boolean;
    };
    expect(arg.webSearchEnabled).toBe(true);
    const on = await screen.findByRole("button", { name: "关闭网页搜索" });
    expect(on.getAttribute("aria-pressed")).toBe("true");
    expect(on.getAttribute("data-tip")).toContain("DuckDuckGo");
  });

  it("rolls back when write fails", async () => {
    hostMocks.setToolsPrefs.mockRejectedValueOnce(new Error("io"));
    renderComposer();
    const btn = await screen.findByRole("button", { name: "开启网页搜索" });
    fireEvent.click(btn);
    await vi.waitFor(() => {
      expect(hostMocks.setToolsPrefs).toHaveBeenCalledTimes(1);
    });
    const again = await screen.findByRole("button", { name: "开启网页搜索" });
    expect(again.getAttribute("aria-pressed")).toBe("false");
  });
});
