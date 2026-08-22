/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { TOOLS_PREFS_LS_KEY, defaultToolsPrefs } from "./tools/types";
import { invokeInquiryTool } from "./host";

afterEach(() => {
  localStorage.removeItem(TOOLS_PREFS_LS_KEY);
});

function seedPrefs(over: Record<string, unknown>) {
  localStorage.setItem(
    TOOLS_PREFS_LS_KEY,
    JSON.stringify({ ...defaultToolsPrefs(), ...over }),
  );
}

describe("browser mock web_search gate", () => {
  it("errors when button off even if backend configured", async () => {
    seedPrefs({ webSearchEnabled: false, webSearchBackend: "ddg" });
    const r = await invokeInquiryTool("web_search", '{"query":"x"}');
    expect(r.ok).toBe(false);
    expect(r.error).toContain("网页搜索已关闭");
  });

  it("succeeds with ddg fallback when on + backend off", async () => {
    seedPrefs({ webSearchEnabled: true, webSearchBackend: "off" });
    const r = await invokeInquiryTool("web_search", '{"query":"x"}');
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("ddg");
  });

  it("succeeds when on + backend tavily", async () => {
    seedPrefs({ webSearchEnabled: true, webSearchBackend: "tavily" });
    const r = await invokeInquiryTool("web_search", '{"query":"x"}');
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("tavily");
  });
});
