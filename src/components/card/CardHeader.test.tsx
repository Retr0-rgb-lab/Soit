/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CardHeader from "./CardHeader";

// jsdom 不提供 rAF（除非 pretendToBeVisual）；CardHeader 用它在挂载后聚焦输入框。
beforeEach(() => {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    (globalThis as unknown as Record<string, unknown>).requestAnimationFrame = (
      cb: FrameRequestCallback,
    ) => setTimeout(() => cb(0), 0) as unknown as number;
    (globalThis as unknown as Record<string, unknown>).cancelAnimationFrame = (
      id: number,
    ) => clearTimeout(id);
  }
});

afterEach(cleanup);

const noop = () => undefined;

describe("CardHeader rename", () => {
  it("renders h1 when not renaming", () => {
    render(<CardHeader crumbs={[]} title="我的探究" onCrumb={noop} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "我的探究",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("renders inline input when renaming", () => {
    render(<CardHeader crumbs={[]} title="我的探究" onCrumb={noop} renaming />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("我的探究");
  });

  it("commits renamed title on Enter", () => {
    const onRename = vi.fn();
    const onRenamingChange = vi.fn();
    render(
      <CardHeader
        crumbs={[]}
        title="旧名"
        onCrumb={noop}
        renaming
        onRename={onRename}
        onRenamingChange={onRenamingChange}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "新名" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("新名");
    expect(onRenamingChange).toHaveBeenCalledWith(false);
  });

  it("cancels on Escape without renaming", () => {
    const onRename = vi.fn();
    const onRenamingChange = vi.fn();
    render(
      <CardHeader
        crumbs={[]}
        title="旧名"
        onCrumb={noop}
        renaming
        onRename={onRename}
        onRenamingChange={onRenamingChange}
      />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(onRenamingChange).toHaveBeenCalledWith(false);
  });
});
