import { describe, expect, it } from "vitest";
import { demoSnapshot } from "./demoSeed";
import { stressFan } from "./stressSeed";
import { stressDeep } from "./stressSeed";
import {
  groupUnreadByThread,
  isInLiveThread,
  rootOf,
  subtreeIds,
} from "./threadDebt";

describe("threadDebt", () => {
  it("groups unread by root", () => {
    const snap = demoSnapshot();
    // c4 unread under c1 root
    const debts = groupUnreadByThread(snap.nodes, "c3");
    expect(debts.length).toBeGreaterThanOrEqual(1);
    expect(debts[0]!.rootId).toBe("c1");
    expect(debts[0]!.unreadCount).toBeGreaterThanOrEqual(1);
  });

  it("subtreeIds includes descendants", () => {
    const snap = stressFan(5);
    const ids = subtreeIds(snap.nodes, "sf-mid");
    expect(ids).toContain("sf-mid");
    expect(ids.length).toBe(6); // mid + 5 children
  });

  it("rootOf walks to root", () => {
    const snap = demoSnapshot();
    expect(rootOf(snap.nodes, "c3")?.id).toBe("c1");
  });

  it("isInLiveThread treats descendants of live root as live", () => {
    const snap = stressDeep(10);
    const root = rootOf(snap.nodes, snap.focusId)!;
    expect(root.id).toBe("sd-0");
    expect(isInLiveThread(snap.nodes, [root.id], snap.focusId)).toBe(true);
    expect(isInLiveThread(snap.nodes, [root.id], "sd-3")).toBe(true);
    expect(isInLiveThread(snap.nodes, ["nope"], snap.focusId)).toBe(false);
  });
});
