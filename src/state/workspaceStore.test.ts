import { beforeEach, describe, expect, it } from "vitest";
import { demoSnapshot } from "../lib/demoSeed";
import { layoutGraph } from "../lib/graphLayout";
import { useWorkspace, useWorkspaceStore } from "./workspaceStore";

describe("workspaceStore", () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadSnapshot(demoSnapshot());
  });

  it("spawnDeepen adds child and focuses it", () => {
    const before = useWorkspaceStore.getState().nodes.length;
    const id = useWorkspaceStore.getState().spawnDeepen("测试");
    const s = useWorkspaceStore.getState();
    expect(s.nodes.length).toBe(before + 1);
    expect(s.focusId).toBe(id);
    const n = s.nodes.find((x) => x.id === id)!;
    expect(n.kind).toBe("deepen");
    expect(n.parentId).toBeTruthy();
  });

  it("spawnDiverge adds diverge child under focus", () => {
    const parent = useWorkspace.getState().focusId;
    const id = useWorkspace.getState().spawnDiverge("平行");
    const n = useWorkspace.getState().nodes.find((x) => x.id === id)!;
    expect(n.kind).toBe("diverge");
    expect(n.parentId).toBe(parent);
    expect(useWorkspace.getState().focusId).toBe(id);
  });

  it("regenerateTurn does not add nodes", () => {
    const s0 = useWorkspaceStore.getState();
    const card = s0.focusId;
    const turnId = s0.turnsByCardId[card][0].id;
    const n0 = s0.nodes.length;
    s0.regenerateTurn(turnId);
    expect(useWorkspaceStore.getState().nodes.length).toBe(n0);
  });

  it("focusNode clears unread on target", () => {
    useWorkspace.getState().focusNode("c4");
    const n = useWorkspace.getState().nodes.find((x) => x.id === "c4")!;
    expect(n.unread).toBe(false);
    expect(useWorkspace.getState().focusId).toBe("c4");
  });

  it("toggleMapMode switches focus and map", () => {
    expect(useWorkspace.getState().workspaceMode).toBe("focus");
    useWorkspace.getState().toggleMapMode();
    expect(useWorkspace.getState().workspaceMode).toBe("map");
    useWorkspace.getState().setWorkspaceMode("focus");
    expect(useWorkspace.getState().workspaceMode).toBe("focus");
  });

  it("spawn returns to focus mode from map", () => {
    useWorkspace.getState().setWorkspaceMode("map");
    useWorkspace.getState().spawnDeepen("x");
    expect(useWorkspace.getState().workspaceMode).toBe("focus");
  });

  it("mapScopeMode defaults to working and is settable", () => {
    expect(useWorkspace.getState().mapScopeMode).toBe("working");
    useWorkspace.getState().setMapScopeMode("atlas");
    expect(useWorkspace.getState().mapScopeMode).toBe("atlas");
  });
});

describe("layoutGraph", () => {
  it("places demo nodes inside viewBox 0..200 x 0..300", () => {
    const laid = layoutGraph(demoSnapshot().nodes);
    expect(laid.length).toBe(5);
    for (const n of laid) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(200);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(300);
    }
    const root = laid.find((n) => n.kind === "root")!;
    const child = laid.find((n) => n.parentId === root.id)!;
    expect(child.y).toBeGreaterThan(root.y);
  });
});
