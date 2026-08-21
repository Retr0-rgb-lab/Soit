import { describe, expect, it } from "vitest";
import type { ProcessStep } from "../../types";
import { isProcessBusy, processEntryLabel } from "./processLabel";

const thinkOk: ProcessStep = {
  id: "1",
  kind: "think",
  title: "思考",
  status: "ok",
};

const searchRun: ProcessStep = {
  id: "2",
  kind: "vault_search",
  title: "检索库内",
  status: "running",
};

describe("processEntryLabel", () => {
  it("think-only closed", () => {
    expect(processEntryLabel([thinkOk], { open: false })).toBe("思考过程");
  });

  it("tools count", () => {
    expect(
      processEntryLabel(
        [
          thinkOk,
          { ...searchRun, status: "ok", id: "3" },
        ],
        { open: false },
      ),
    ).toBe("过程 · 2 步");
  });

  it("error", () => {
    expect(
      processEntryLabel(
        [{ ...searchRun, status: "error", id: "e" }],
        { open: false },
      ),
    ).toBe("过程 · 有失败");
  });

  it("busy running title", () => {
    expect(processEntryLabel([searchRun], { open: false, busy: true })).toBe(
      "检索库内…",
    );
  });
});

describe("isProcessBusy", () => {
  it("running step", () => {
    expect(isProcessBusy([searchRun])).toBe(true);
  });
  it("think status string", () => {
    expect(isProcessBusy([], "生成中…")).toBe(true);
  });
});
