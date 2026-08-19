import { beforeEach, describe, expect, it } from "vitest";
import { demoSnapshot } from "../lib/demoSeed";
import { layoutGraph } from "../lib/graphLayout";
import { useWorkspace, useWorkspaceStore } from "./workspaceStore";

describe("workspaceStore", () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadSnapshot(demoSnapshot());
  });

  it("spawnDeepen adds child, edge with SourceSpan, and focuses it", async () => {
    const before = useWorkspaceStore.getState().nodes.length;
    const parent = useWorkspaceStore.getState().focusId;
    const edgeCount = useWorkspaceStore.getState().edges.length;
    const id = await useWorkspaceStore.getState().spawnDeepen("测试");
    const s = useWorkspaceStore.getState();
    expect(s.nodes.length).toBe(before + 1);
    expect(s.focusId).toBe(id);
    const n = s.nodes.find((x) => x.id === id)!;
    expect(n.kind).toBe("deepen");
    expect(n.parentId).toBe(parent);
    expect(s.edges.length).toBe(edgeCount + 1);
    const edge = s.edges.find((e) => e.toCardId === id)!;
    expect(edge.kind).toBe("deepen");
    expect(edge.fromCardId).toBe(parent);
    expect(edge.source.text).toBe("测试");
    expect(edge.actor).toBe("user");
    // deepen seeds a turn
    expect((s.turnsByCardId[id] ?? []).length).toBeGreaterThan(0);
  });

  it("spawnDiverge creates empty turns and edge", async () => {
    const parent = useWorkspace.getState().focusId;
    const id = await useWorkspace.getState().spawnDiverge("平行");
    const s = useWorkspace.getState();
    const n = s.nodes.find((x) => x.id === id)!;
    expect(n.kind).toBe("diverge");
    expect(n.parentId).toBe(parent);
    expect(s.focusId).toBe(id);
    expect(s.turnsByCardId[id] ?? []).toEqual([]);
    const edge = s.edges.find((e) => e.toCardId === id)!;
    expect(edge.kind).toBe("diverge");
    expect(edge.source.text).toBe("平行");
  });

  it("spawnInquiry is the unified API for deepen/diverge", async () => {
    const parent = useWorkspaceStore.getState().focusId;
    const id = await useWorkspaceStore.getState().spawnInquiry({
      kind: "deepen",
      source: { turnId: "t1", text: "范畴", markId: "范畴" },
      why: "because",
      actor: "agent",
    });
    const edge = useWorkspaceStore.getState().edges.find((e) => e.toCardId === id)!;
    expect(edge.fromCardId).toBe(parent);
    expect(edge.source.turnId).toBe("t1");
    expect(edge.source.markId).toBe("范畴");
    expect(edge.why).toBe("because");
    expect(edge.actor).toBe("agent");
  });

  it("returnToSource focuses parent and sets highlightSpan", () => {
    // c3 → parent c2 with edge source 函子
    useWorkspace.getState().focusNode("c3");
    useWorkspace.getState().returnToSource();
    const s = useWorkspace.getState();
    expect(s.focusId).toBe("c2");
    expect(s.highlightSpan?.text).toBe("函子");
    expect(s.highlightSpan?.turnId).toBe("t0");
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

  it("spawn returns to focus mode from map", async () => {
    useWorkspace.getState().setWorkspaceMode("map");
    await useWorkspace.getState().spawnDeepen("x");
    expect(useWorkspace.getState().workspaceMode).toBe("focus");
  });

  it("mapScopeMode defaults to working and is settable", () => {
    expect(useWorkspace.getState().mapScopeMode).toBe("working");
    useWorkspace.getState().setMapScopeMode("atlas");
    expect(useWorkspace.getState().mapScopeMode).toBe("atlas");
  });

  it("markThreadRead clears unread in subtree", () => {
    useWorkspace.getState().focusNode("c1");
    const snap = demoSnapshot();
    useWorkspace.getState().loadSnapshot(snap);
    expect(useWorkspace.getState().nodes.find((n) => n.id === "c4")!.unread).toBe(
      true,
    );
    useWorkspace.getState().markThreadRead("c4");
    expect(
      useWorkspace.getState().nodes.filter((n) => n.unread).length,
    ).toBe(0);
  });

  it("pinLive respects LIVE_MAX via repeated pins", () => {
    const s = useWorkspace.getState();
    for (let i = 0; i < 8; i++) {
      s.pinLive(s.nodes[i % s.nodes.length]!.id);
    }
    expect(useWorkspace.getState().liveIds.length).toBeLessThanOrEqual(5);
  });

  it("loadSnapshot loads demo edges", () => {
    const edges = useWorkspaceStore.getState().edges;
    expect(edges.length).toBeGreaterThanOrEqual(4);
    expect(edges.every((e) => e.source.turnId && e.source.text)).toBe(true);
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
