/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import TurnItem from "./TurnItem";
import type { Turn } from "../../types";

afterEach(cleanup);

function makeTurn(process: Turn["process"]): Turn {
  return {
    id: "t1",
    title: "思考",
    collapsed: false,
    user: "用户问题",
    aiHtml: "<p>正式回答</p>",
    think: "",
    thinkOpen: false,
    process,
  };
}

const noop = () => undefined;

function renderTurn(turn: Turn) {
  render(
    <TurnItem
      turn={turn}
      onToggleCollapsed={noop}
      onDeepen={noop}
      onDiverge={noop}
      onRegenerate={noop}
      onDelete={noop}
      onMarkClick={noop}
      onAiMouseUp={noop}
    />,
  );
}

describe("TurnItem process/think strip", () => {
  it("renders think detail markdown (headings, bold, GFM tables) as HTML", () => {
    renderTurn(
      makeTurn([
        {
          id: "p1",
          kind: "think",
          title: "思考",
          status: "ok",
          detail: [
            "## 三编结构",
            "",
            "| 编 | 主题 |",
            "|---|---|",
            "| 存在论 | 有 / 无 / 变 |",
            "| **本质论** | 本质 / 现象 |",
          ].join("\n"),
        },
      ]),
    );

    const body = document.querySelector(".ic-process-detail-body");
    expect(body).not.toBeNull();
    const table = body!.querySelector("table");
    expect(table).not.toBeNull();
    expect(table!.querySelector("th")?.textContent).toContain("编");
    expect(table!.textContent).toContain("存在论");
    // Raw markdown source must not leak through as literal text.
    expect(body!.textContent).not.toContain("|---|---|");
    expect(body!.textContent).not.toContain("| 编 |");
    expect(body!.querySelector("h2")?.textContent).toContain("三编结构");
    expect(body!.querySelector("strong")?.textContent).toBe("本质论");
  });

  it("keeps tool step detail as raw pre, not markdown", () => {
    renderTurn(
      makeTurn([
        {
          id: "p1",
          kind: "vault_search",
          title: "检索库内",
          status: "ok",
          detail: "raw output **not bold** <not an element>",
        },
      ]),
    );

    const pre = document.querySelector(".ic-process-detail pre");
    expect(pre).not.toBeNull();
    // React-escaped, but never markdown-rendered.
    expect(pre!.textContent).toContain("**not bold**");
    expect(pre!.textContent).toContain("<not an element>");
    expect(pre!.querySelector("strong")).toBeNull();
    expect(screen.queryByText("bold")).toBeNull();
  });

  it("renders no detail body when a think step has no detail", () => {
    renderTurn(
      makeTurn([
        { id: "p1", kind: "think", title: "思考", status: "ok", detail: "" },
      ]),
    );
    expect(document.querySelector(".ic-process-detail-body")).toBeNull();
    expect(screen.queryByText("三编结构")).toBeNull();
  });
});
