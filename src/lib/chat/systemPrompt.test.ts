import { describe, expect, it } from "vitest";
import { buildInquirySystemPrompt } from "./systemPrompt";

describe("buildInquirySystemPrompt tool policy", () => {
  it("omits tool section when both switches off", () => {
    const p = buildInquirySystemPrompt(undefined, {});
    expect(p).not.toContain("Host tools");
    expect(p).not.toContain("web_search");
  });

  it("lists all three when tools on + button on", () => {
    const p = buildInquirySystemPrompt(undefined, {
      toolsEnabled: true,
      webSearchEnabled: true,
    });
    expect(p).toContain("vault_search");
    expect(p).toContain("fetch_url");
    expect(p).toContain("web_search");
  });

  it("lists only web_search when button on + tools off", () => {
    const p = buildInquirySystemPrompt(undefined, {
      toolsEnabled: false,
      webSearchEnabled: true,
    });
    expect(p).toContain("web_search");
    expect(p).not.toContain("vault_search");
    expect(p).not.toContain("fetch_url");
  });

  it("omits web_search when button off + tools on", () => {
    const p = buildInquirySystemPrompt(undefined, {
      toolsEnabled: true,
      webSearchEnabled: false,
    });
    expect(p).toContain("vault_search");
    expect(p).not.toContain("web_search");
  });
});
