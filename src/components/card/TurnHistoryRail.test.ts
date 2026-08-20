import { describe, expect, it } from "vitest";
import type { TurnHistoryItem } from "./TurnHistoryRail";

/** Pure helper mirrored from InquiryCard rail active resolution. */
function resolveRailActiveId(
  turns: TurnHistoryItem[],
  activeTurnId: string | null,
  highlightTurnId?: string | null,
): string | null {
  if (activeTurnId && turns.some((t) => t.id === activeTurnId)) {
    return activeTurnId;
  }
  if (highlightTurnId && turns.some((t) => t.id === highlightTurnId)) {
    return highlightTurnId;
  }
  const open = turns.find((t) => !t.collapsed);
  if (open) return open.id;
  return turns.length ? turns[turns.length - 1]!.id : null;
}

describe("TurnHistoryRail active resolution", () => {
  const turns: TurnHistoryItem[] = [
    { id: "t0", title: "开场", collapsed: true },
    { id: "t1", title: "函子", collapsed: false },
    { id: "t2", title: "平行", collapsed: true },
  ];

  it("prefers explicit active selection", () => {
    expect(resolveRailActiveId(turns, "t2", "t1")).toBe("t2");
  });

  it("falls back to highlight span turn", () => {
    expect(resolveRailActiveId(turns, null, "t0")).toBe("t0");
  });

  it("falls back to first expanded turn", () => {
    expect(resolveRailActiveId(turns, null, null)).toBe("t1");
  });

  it("falls back to last turn when all collapsed", () => {
    const all: TurnHistoryItem[] = turns.map((t) => ({
      ...t,
      collapsed: true,
    }));
    expect(resolveRailActiveId(all, null, null)).toBe("t2");
  });

  it("empty turns → null", () => {
    expect(resolveRailActiveId([], null, null)).toBe(null);
  });
});
