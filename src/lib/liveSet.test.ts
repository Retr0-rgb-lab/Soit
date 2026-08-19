import { describe, expect, it } from "vitest";
import { LIVE_MAX, pinLiveId, touchSession, unpinLiveId } from "./liveSet";

describe("liveSet", () => {
  it("pins to front and drops oldest over max", () => {
    let live: string[] = [];
    for (let i = 0; i < LIVE_MAX + 2; i++) {
      live = pinLiveId(live, `t${i}`, LIVE_MAX).liveIds;
    }
    expect(live.length).toBe(LIVE_MAX);
    expect(live[0]).toBe(`t${LIVE_MAX + 1}`);
    expect(live.includes("t0")).toBe(false);
  });

  it("unpin removes id", () => {
    expect(unpinLiveId(["a", "b"], "a")).toEqual(["b"]);
  });

  it("touchSession caps and moves front", () => {
    const s = touchSession(["a", "b"], "c", 2);
    expect(s).toEqual(["c", "a"]);
  });
});
