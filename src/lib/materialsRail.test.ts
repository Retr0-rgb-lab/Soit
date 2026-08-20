import { describe, expect, it } from "vitest";
import {
  forceCloseMaterialsRail,
  initialMaterialsRail,
} from "./materialsRail";

describe("materialsRail helpers", () => {
  it("initialMaterialsRail starts closed idle", () => {
    const s = initialMaterialsRail();
    expect(s.open).toBe(false);
    expect(s.listStatus).toBe("idle");
    expect(s.entries).toEqual([]);
    expect(s.selectedPathRel).toBeNull();
    expect(s.importBusy).toBe(false);
    expect(s.listEpoch).toBe(0);
  });

  it("forceCloseMaterialsRail closes and bumps epoch", () => {
    const open = {
      ...initialMaterialsRail(),
      open: true,
      listStatus: "ready" as const,
      entries: [
        {
          pathRel: "demo/welcome.md",
          name: "welcome.md",
          kind: "md",
          size: 10,
        },
      ],
      selectedPathRel: "demo/welcome.md",
      listEpoch: 3,
      importBusy: true,
      error: "x",
    };
    const closed = forceCloseMaterialsRail(open);
    expect(closed.open).toBe(false);
    expect(closed.listStatus).toBe("idle");
    expect(closed.importBusy).toBe(false);
    expect(closed.error).toBeNull();
    expect(closed.listEpoch).toBe(4);
    // keep highlight / entries for optional reopen paint
    expect(closed.selectedPathRel).toBe("demo/welcome.md");
    expect(closed.entries).toHaveLength(1);
  });
});
