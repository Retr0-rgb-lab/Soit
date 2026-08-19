import { describe, expect, it } from "vitest";
import { demoSnapshot } from "./demoSeed";
import { stressFan } from "./stressSeed";
import {
  groupUnreadByThread,
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
});
