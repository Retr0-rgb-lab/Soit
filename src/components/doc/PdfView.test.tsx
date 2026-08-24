/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PdfView from "./PdfView";

const hostMocks = vi.hoisted(() => ({
  getPdfPreviewUrl: vi.fn(),
}));

vi.mock("../../lib/host", () => ({
  getPdfPreviewUrl: (...args: unknown[]) => hostMocks.getPdfPreviewUrl(...args),
}));

afterEach(cleanup);

const docRef = {
  pathRel: "notes/paper.pdf",
  displayName: "paper.pdf",
  kind: "pdf" as const,
  size: 1234,
};

beforeEach(() => {
  hostMocks.getPdfPreviewUrl.mockResolvedValue({
    ok: true,
    url: "http://127.0.0.1:45678/doc?path=notes%2Fpaper.pdf&t=abc",
  });
});

describe("PdfView", () => {
  it("renders iframe when preview url resolves", async () => {
    render(<PdfView docRef={docRef} />);
    const frame = await screen.findByTitle("paper.pdf");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame.getAttribute("src")).toContain("127.0.0.1:45678");
    expect(hostMocks.getPdfPreviewUrl).toHaveBeenCalledWith("notes/paper.pdf");
  });

  it("falls back to PdfGuide when host errors", async () => {
    hostMocks.getPdfPreviewUrl.mockResolvedValueOnce({
      ok: false,
      error: "桌面版支持内嵌 PDF 预览",
    });
    render(<PdfView docRef={docRef} />);
    expect(
      await screen.findByRole("heading", { name: "PDF 内嵌预览不可用" }),
    ).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
  });
});
