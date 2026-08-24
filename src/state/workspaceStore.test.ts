import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoSnapshot } from "../lib/demoSeed";
import { layoutGraph } from "../lib/graphLayout";
import type { ChatCompleteInput, ChatCompleteResult, ChatPort } from "../lib/chat";
import type { Turn, WorkspaceSnapshot } from "../types";
import { useWorkspace, useWorkspaceStore } from "./workspaceStore";

const hostMocks = vi.hoisted(() => ({
  spawnInquiry: vi.fn(),
  appendTurn: vi.fn(),
  updateTurn: vi.fn(),
  deleteTurn: vi.fn(),
  deleteInquiry: vi.fn(),
  updateCard: vi.fn(),
  getEnabledSkillsText: vi.fn(async () => ""),
}));

const chatPortMocks = vi.hoisted(() => ({
  /** When set, resolvePort returns this port instead of real MockChat. */
  override: null as ChatPort | null,
}));

vi.mock("../lib/host", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/host")>();
  return {
    ...actual,
    spawnInquiry: hostMocks.spawnInquiry,
    appendTurn: hostMocks.appendTurn,
    updateTurn: hostMocks.updateTurn,
    deleteTurn: hostMocks.deleteTurn,
    deleteInquiry: hostMocks.deleteInquiry,
    updateCard: hostMocks.updateCard,
    getEnabledSkillsText: hostMocks.getEnabledSkillsText,
  };
});

vi.mock("../lib/chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/chat")>();
  return {
    ...actual,
    resolvePort: async () =>
      chatPortMocks.override ?? (await actual.resolvePort()),
  };
});

function universeSnap(partial?: Partial<WorkspaceSnapshot>): WorkspaceSnapshot {
  const demo = demoSnapshot();
  return {
    ...demo,
    source: "universe",
    nodes: demo.nodes.map((n) => ({ ...n })),
    edges: (demo.edges ?? []).map((e) => ({ ...e, source: { ...e.source } })),
    turnsByCardId: Object.fromEntries(
      Object.entries(demo.turnsByCardId).map(([k, turns]) => [
        k,
        turns.map((t) => ({ ...t })),
      ]),
    ),
    ...partial,
  };
}

/** Delayed port for cancel races — honors AbortSignal. */
function delayedPort(
  result: ChatCompleteResult,
  delayMs = 200,
): ChatPort {
  return {
    async complete(input: ChatCompleteInput): Promise<ChatCompleteResult> {
      const signal = input.signal;
      if (signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, delayMs);
        const onAbort = () => {
          clearTimeout(timer);
          reject(new DOMException("The operation was aborted.", "AbortError"));
        };
        if (signal) {
          if (signal.aborted) {
            clearTimeout(timer);
            reject(new DOMException("The operation was aborted.", "AbortError"));
            return;
          }
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });
      return result;
    },
  };
}

describe("workspaceStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatPortMocks.override = null;
    hostMocks.getEnabledSkillsText.mockResolvedValue("");
    hostMocks.updateCard.mockResolvedValue({ ok: true as const });
    hostMocks.updateTurn.mockResolvedValue({ ok: true as const });
    hostMocks.deleteTurn.mockResolvedValue({ ok: true as const });
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
    expect(s.highlightSpan?.turnId).toBe("c2_t2");
  });

  it("spawnInquiry keeps full text and doc anchors on edge source", async () => {
    const parent = useWorkspaceStore.getState().focusId;
    const full =
      "这是一段超过四十八个字符的文档选区全文，用于确认不会被 spawnDeepen 便利封装截断 —— 保留全文。";
    expect(full.length).toBeGreaterThan(48);
    const id = await useWorkspaceStore.getState().spawnInquiry({
      kind: "deepen",
      source: {
        turnId: "t_last",
        text: full,
        docPath: "demo/welcome.md",
        docKind: "md",
        docPage: 2,
      },
      actor: "user",
    });
    const edge = useWorkspaceStore.getState().edges.find((e) => e.toCardId === id)!;
    expect(edge.fromCardId).toBe(parent);
    expect(edge.source.text).toBe(full);
    expect(edge.source.docPath).toBe("demo/welcome.md");
    expect(edge.source.docKind).toBe("md");
    expect(edge.source.docPage).toBe(2);
    expect(edge.source.turnId).toBe("t_last");
  });

  it("returnToSource with docPath focuses parent and opens doc", async () => {
    const parent = useWorkspaceStore.getState().focusId;
    const id = await useWorkspaceStore.getState().spawnInquiry({
      kind: "deepen",
      source: {
        turnId: "t_doc",
        text: "锚点句",
        docPath: "demo/welcome.md",
        docKind: "md",
        docPage: 1,
      },
    });
    expect(useWorkspaceStore.getState().focusId).toBe(id);
    useWorkspaceStore.getState().returnToSource();
    const s = useWorkspaceStore.getState();
    expect(s.focusId).toBe(parent);
    // openDoc is async — wait a tick for mock resolve/read
    await vi.waitFor(() => {
      const doc = useWorkspaceStore.getState().docSession;
      expect(doc.status).toBe("ready");
      expect(doc.ref?.pathRel).toBe("demo/welcome.md");
      expect(doc.cursor.page).toBe(1);
    });
  });

  it("regenerateTurn does not add nodes", async () => {
    const s0 = useWorkspaceStore.getState();
    const card = s0.focusId;
    const turnId = s0.turnsByCardId[card][0].id;
    const n0 = s0.nodes.length;
    const turns0 = s0.turnsByCardId[card].length;
    await s0.regenerateTurn(turnId, card);
    const s1 = useWorkspaceStore.getState();
    expect(s1.nodes.length).toBe(n0);
    expect(s1.turnsByCardId[card].length).toBe(turns0);
    expect(s1.turnsByCardId[card].find((t) => t.id === turnId)?.aiHtml).toBeTruthy();
  });

  it("toggle/delete turn is scoped to the focused card only", async () => {
    const s = useWorkspaceStore.getState();
    // Ensure unique ids across cards (regression guard for old shared t0).
    const allIds = Object.values(s.turnsByCardId).flatMap((ts) => ts.map((t) => t.id));
    expect(new Set(allIds).size).toBe(allIds.length);

    s.focusNode("c3");
    const c3First = s.turnsByCardId.c3![0]!;
    const c1Collapsed = s.turnsByCardId.c1![0]!.collapsed;
    const c2Collapsed = s.turnsByCardId.c2![0]!.collapsed;
    await s.toggleTurnCollapsed(c3First.id, "c3");
    expect(useWorkspaceStore.getState().turnsByCardId.c3![0]!.collapsed).toBe(
      !c3First.collapsed,
    );
    expect(useWorkspaceStore.getState().turnsByCardId.c1![0]!.collapsed).toBe(
      c1Collapsed,
    );
    expect(useWorkspaceStore.getState().turnsByCardId.c2![0]!.collapsed).toBe(
      c2Collapsed,
    );

    await s.deleteTurn(c3First.id, "c3");
    expect(
      useWorkspaceStore.getState().turnsByCardId.c3!.find((t) => t.id === c3First.id),
    ).toBeUndefined();
    expect(useWorkspaceStore.getState().turnsByCardId.c1!.length).toBe(1);
    expect(useWorkspaceStore.getState().turnsByCardId.c2!.length).toBe(3);
  });

  it("deleteInquiry leaf focuses parent and strips edges/turns", async () => {
    useWorkspaceStore.getState().focusNode("c3");
    const next = await useWorkspaceStore.getState().deleteInquiry("c3");
    const s = useWorkspaceStore.getState();
    expect(next).toBe("c2");
    expect(s.focusId).toBe("c2");
    expect(s.nodes.some((n) => n.id === "c3")).toBe(false);
    expect(s.turnsByCardId.c3).toBeUndefined();
    expect(s.edges.some((e) => e.toCardId === "c3" || e.fromCardId === "c3")).toBe(
      false,
    );
  });

  it("deleteInquiry subtree removes descendants", async () => {
    useWorkspaceStore.getState().focusNode("c3");
    await useWorkspaceStore.getState().deleteInquiry("c2");
    const s = useWorkspaceStore.getState();
    expect(s.focusId).toBe("c1");
    expect(s.nodes.map((n) => n.id).sort()).toEqual(["c1"]);
    expect(s.edges).toEqual([]);
  });

  it("deleteInquiry universe uses host and does not memory-drop on failure", async () => {
    useWorkspaceStore.getState().loadSnapshot(universeSnap({ focusId: "c3" }));
    hostMocks.deleteInquiry.mockRejectedValueOnce(new Error("db down"));
    const before = useWorkspaceStore.getState().nodes.length;
    await useWorkspaceStore.getState().deleteInquiry("c3");
    expect(hostMocks.deleteInquiry).toHaveBeenCalledWith("c3");
    expect(useWorkspaceStore.getState().nodes.length).toBe(before);
    expect(useWorkspaceStore.getState().nodes.some((n) => n.id === "c3")).toBe(
      true,
    );
  });

  it("deleteInquiry universe merges host snapshot", async () => {
    useWorkspaceStore.getState().loadSnapshot(universeSnap({ focusId: "c3" }));
    const demo = demoSnapshot();
    const after = universeSnap({
      focusId: "c2",
      nodes: demo.nodes.filter((n) => n.id !== "c3"),
      edges: (demo.edges ?? []).filter(
        (e) => e.toCardId !== "c3" && e.fromCardId !== "c3",
      ),
      turnsByCardId: Object.fromEntries(
        Object.entries(demo.turnsByCardId).filter(([k]) => k !== "c3"),
      ),
    });
    hostMocks.deleteInquiry.mockResolvedValueOnce({ ok: true, snapshot: after });
    await useWorkspaceStore.getState().deleteInquiry("c3");
    expect(useWorkspaceStore.getState().focusId).toBe("c2");
    expect(useWorkspaceStore.getState().nodes.some((n) => n.id === "c3")).toBe(
      false,
    );
  });

  it("spawnInquiry leaves focused child unread=false", async () => {
    const id = await useWorkspaceStore.getState().spawnDeepen("未读检查");
    const n = useWorkspaceStore.getState().nodes.find((x) => x.id === id)!;
    expect(n.unread).toBe(false);
    expect(useWorkspaceStore.getState().focusId).toBe(id);
  });

  it("appendUserMessage completes via ChatPort with mark HTML", async () => {
    const card = useWorkspaceStore.getState().focusId;
    const before = useWorkspaceStore.getState().turnsByCardId[card].length;
    await useWorkspaceStore.getState().appendUserMessage("函子是什么？");
    const turns = useWorkspaceStore.getState().turnsByCardId[card];
    expect(turns.length).toBe(before + 1);
    const last = turns[turns.length - 1]!;
    expect(last.user).toContain("函子");
    expect(last.aiHtml).toContain('class="mark"');
    expect(last.aiHtml).toContain('data-term="函子"');
    // no new nodes from send
    expect(useWorkspaceStore.getState().nodes.length).toBe(
      demoSnapshot().nodes.length,
    );
    expect(hostMocks.appendTurn).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().inquiryInflight).toBeNull();
  });

  it("cancelInflight prevents late complete write", async () => {
    chatPortMocks.override = delayedPort(
      { text: "should not land", marks: [{ term: "函子" }] },
      300,
    );
    const card = useWorkspaceStore.getState().focusId;
    const before = useWorkspaceStore.getState().turnsByCardId[card]!.length;
    const pending = useWorkspaceStore.getState().appendUserMessage("cancel me");
    // Wait until inflight is registered, then cancel.
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().inquiryInflight).not.toBeNull();
    });
    const turnId = useWorkspaceStore.getState().inquiryInflight!.turnId;
    useWorkspaceStore.getState().cancelInflight();
    expect(useWorkspaceStore.getState().inquiryInflight).toBeNull();
    await pending;
    const turn = useWorkspaceStore
      .getState()
      .turnsByCardId[card]!.find((t) => t.id === turnId)!;
    expect(turn.aiHtml).toBe("");
    expect(turn.aiHtml).not.toContain("should not land");
    expect(useWorkspaceStore.getState().turnsByCardId[card]!.length).toBe(
      before + 1,
    );
  });

  it("empty model text becomes 非空 placeholder html", async () => {
    chatPortMocks.override = {
      async complete() {
        return { text: "   ", marks: undefined };
      },
    };
    const card = useWorkspaceStore.getState().focusId;
    await useWorkspaceStore.getState().appendUserMessage("empty please");
    const turnsEmpty = useWorkspaceStore.getState().turnsByCardId[card]!;
    const last = turnsEmpty[turnsEmpty.length - 1]!;
    expect(last.aiHtml.length).toBeGreaterThan(0);
    expect(last.aiHtml).toContain("模型返回为空");
  });

  it("focusNode clears unread on target", () => {
    useWorkspace.getState().focusNode("c4");
    const n = useWorkspace.getState().nodes.find((x) => x.id === "c4")!;
    expect(n.unread).toBe(false);
    expect(useWorkspace.getState().focusId).toBe("c4");
    expect(hostMocks.updateCard).not.toHaveBeenCalled();
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

  it("bootEpoch ignores stale loadSnapshot", () => {
    const epoch = useWorkspaceStore.getState().beginBootLoad();
    useWorkspaceStore.getState().beginBootLoad(); // newer load wins
    useWorkspaceStore.getState().loadSnapshot(universeSnap({ focusId: "c1" }), epoch);
    // stale epoch must not apply
    expect(useWorkspaceStore.getState().focusId).not.toBe("c1");
    const fresh = useWorkspaceStore.getState().bootEpoch;
    useWorkspaceStore.getState().loadSnapshot(universeSnap({ focusId: "c1" }), fresh);
    expect(useWorkspaceStore.getState().focusId).toBe("c1");
    expect(useWorkspaceStore.getState().source).toBe("universe");
  });
});

describe("workspaceStore universe write-through", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatPortMocks.override = null;
    hostMocks.getEnabledSkillsText.mockResolvedValue("");
    hostMocks.updateCard.mockResolvedValue({ ok: true as const });
    hostMocks.updateTurn.mockResolvedValue({ ok: true as const });
    hostMocks.deleteTurn.mockResolvedValue({ ok: true as const });
    useWorkspaceStore.getState().loadSnapshot(universeSnap());
  });

  it("spawnInquiry host failure adds no node", async () => {
    const before = useWorkspaceStore.getState().nodes.length;
    hostMocks.spawnInquiry.mockRejectedValueOnce(new Error("db down"));
    const id = await useWorkspaceStore.getState().spawnInquiry({
      kind: "deepen",
      source: { turnId: "c3_t0", text: "x" },
    });
    expect(id).toBe("");
    expect(useWorkspaceStore.getState().nodes.length).toBe(before);
    expect(hostMocks.spawnInquiry).toHaveBeenCalled();
  });

  it("spawnInquiry never falls back to memory on universe", async () => {
    hostMocks.spawnInquiry.mockRejectedValueOnce(new Error("fail"));
    const n0 = useWorkspaceStore.getState().nodes.length;
    const e0 = useWorkspaceStore.getState().edges.length;
    await useWorkspaceStore.getState().spawnDeepen("ghost");
    expect(useWorkspaceStore.getState().nodes.length).toBe(n0);
    expect(useWorkspaceStore.getState().edges.length).toBe(e0);
  });

  it("appendUserMessage goes through host append_turn then update_turn", async () => {
    const card = useWorkspaceStore.getState().focusId;
    const hostTurn: Turn = {
      id: "t_host_1",
      title: "新消息",
      collapsed: false,
      user: "hello host",
      aiHtml: "",
      think: "",
      thinkOpen: false,
    };
    hostMocks.appendTurn.mockResolvedValueOnce({ turn: hostTurn });
    hostMocks.updateTurn.mockResolvedValueOnce({ ok: true as const });

    await useWorkspaceStore.getState().appendUserMessage("hello host");

    expect(hostMocks.appendTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: card,
        user: "hello host",
      }),
    );
    expect(hostMocks.updateTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: card,
        turnId: "t_host_1",
        aiHtml: expect.any(String),
      }),
    );
    const turns = useWorkspaceStore.getState().turnsByCardId[card]!;
    const last = turns[turns.length - 1]!;
    expect(last.id).toBe("t_host_1");
    expect(last.aiHtml).toBeTruthy();
  });

  it("append_turn failure does not add a ghost turn", async () => {
    const card = useWorkspaceStore.getState().focusId;
    const before = useWorkspaceStore.getState().turnsByCardId[card]!.length;
    hostMocks.appendTurn.mockRejectedValueOnce(new Error("no db"));
    await useWorkspaceStore.getState().appendUserMessage("should fail");
    expect(useWorkspaceStore.getState().turnsByCardId[card]!.length).toBe(before);
    expect(hostMocks.updateTurn).not.toHaveBeenCalled();
  });

  it("deleteTurn uses host delete_turn", async () => {
    const card = useWorkspaceStore.getState().focusId;
    const turnId = useWorkspaceStore.getState().turnsByCardId[card]![0]!.id;
    hostMocks.deleteTurn.mockResolvedValueOnce({ ok: true as const });
    await useWorkspaceStore.getState().deleteTurn(turnId, card);
    expect(hostMocks.deleteTurn).toHaveBeenCalledWith({ cardId: card, turnId });
    expect(
      useWorkspaceStore.getState().turnsByCardId[card]!.find((t) => t.id === turnId),
    ).toBeUndefined();
  });

  it("delete_turn host failure keeps the turn", async () => {
    const card = useWorkspaceStore.getState().focusId;
    const turnId = useWorkspaceStore.getState().turnsByCardId[card]![0]!.id;
    hostMocks.deleteTurn.mockRejectedValueOnce(new Error("locked"));
    await useWorkspaceStore.getState().deleteTurn(turnId, card);
    expect(
      useWorkspaceStore.getState().turnsByCardId[card]!.find((t) => t.id === turnId),
    ).toBeDefined();
  });

  it("toggleTurnCollapsed uses host update_turn", async () => {
    const card = useWorkspaceStore.getState().focusId;
    const turn = useWorkspaceStore.getState().turnsByCardId[card]![0]!;
    const next = !turn.collapsed;
    hostMocks.updateTurn.mockResolvedValueOnce({ ok: true as const });
    await useWorkspaceStore.getState().toggleTurnCollapsed(turn.id, card);
    expect(hostMocks.updateTurn).toHaveBeenCalledWith({
      cardId: card,
      turnId: turn.id,
      collapsed: next,
    });
    expect(
      useWorkspaceStore.getState().turnsByCardId[card]!.find((t) => t.id === turn.id)!
        .collapsed,
    ).toBe(next);
  });

  it("regenerateTurn updates via host without new nodes", async () => {
    const card = useWorkspaceStore.getState().focusId;
    const turnId = useWorkspaceStore.getState().turnsByCardId[card]![0]!.id;
    const n0 = useWorkspaceStore.getState().nodes.length;
    hostMocks.updateTurn.mockResolvedValueOnce({ ok: true as const });
    await useWorkspaceStore.getState().regenerateTurn(turnId, card);
    expect(useWorkspaceStore.getState().nodes.length).toBe(n0);
    expect(hostMocks.updateTurn).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: card, turnId }),
    );
    expect(hostMocks.spawnInquiry).not.toHaveBeenCalled();
  });

  it("focusNode clears unread via update_card", async () => {
    useWorkspaceStore.getState().loadSnapshot(
      universeSnap({
        nodes: demoSnapshot().nodes.map((n) =>
          n.id === "c4" ? { ...n, unread: true } : { ...n },
        ),
      }),
    );
    expect(useWorkspaceStore.getState().source).toBe("universe");
    expect(useWorkspaceStore.getState().nodes.find((n) => n.id === "c4")!.unread).toBe(
      true,
    );
    useWorkspaceStore.getState().focusNode("c4");
    expect(useWorkspaceStore.getState().nodes.find((n) => n.id === "c4")!.unread).toBe(
      false,
    );
    await vi.waitFor(() => {
      expect(hostMocks.updateCard).toHaveBeenCalledWith({
        cardId: "c4",
        unread: false,
      });
    });
  });

  it("markThreadRead clears unread via update_card", async () => {
    useWorkspaceStore.getState().loadSnapshot(
      universeSnap({
        nodes: demoSnapshot().nodes.map((n) =>
          n.id === "c4" ? { ...n, unread: true } : { ...n, unread: false },
        ),
      }),
    );
    useWorkspaceStore.getState().markThreadRead("c4");
    await vi.waitFor(() => {
      expect(hostMocks.updateCard).toHaveBeenCalledWith({
        cardId: "c4",
        unread: false,
      });
    });
  });
});

describe("workspaceStore runtime handoff + brief", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatPortMocks.override = null;
    hostMocks.getEnabledSkillsText.mockResolvedValue("");
    hostMocks.updateCard.mockResolvedValue({ ok: true as const });
    hostMocks.updateTurn.mockResolvedValue({ ok: true as const });
    hostMocks.deleteTurn.mockResolvedValue({ ok: true as const });
    useWorkspaceStore.getState().loadSnapshot(demoSnapshot());
  });

  it("mock handoff adds one turn and does not spawn nodes", async () => {
    const s0 = useWorkspaceStore.getState();
    const card = s0.focusId;
    const n0 = s0.nodes.length;
    const t0 = s0.turnsByCardId[card]!.length;

    await s0.startRuntimeHandoff({ runtimeId: "mock" });

    const s1 = useWorkspaceStore.getState();
    expect(s1.nodes.length).toBe(n0);
    expect(s1.edges.length).toBe(s0.edges.length);
    expect(s1.turnsByCardId[card]!.length).toBe(t0 + 1);
    const turnsHandoff = s1.turnsByCardId[card]!;
    const last = turnsHandoff[turnsHandoff.length - 1]!;
    expect(last.user).toContain("交给本地 Agent");
    expect(last.aiHtml).toBeTruthy();
    expect(last.aiHtml).toContain('class="mark"');
    expect(last.aiHtml).toContain("函子");
    expect(s1.runtimeRun).toBeNull();
    expect(hostMocks.spawnInquiry).not.toHaveBeenCalled();
  }, 10_000);

  it("importAssistantToFocus escapes raw html and adds a turn", async () => {
    const card = useWorkspaceStore.getState().focusId;
    const before = useWorkspaceStore.getState().turnsByCardId[card]!.length;
    await useWorkspaceStore
      .getState()
      .importAssistantToFocus('<script>alert(1)</script> and [[范畴]]');

    const turns = useWorkspaceStore.getState().turnsByCardId[card]!;
    expect(turns.length).toBe(before + 1);
    const last = turns[turns.length - 1]!;
    expect(last.user).toBe("（导入自外部 Agent）");
    expect(last.aiHtml).not.toContain("<script>");
    expect(last.aiHtml).toContain("&lt;script&gt;");
    expect(last.aiHtml).toContain('data-term="范畴"');
    expect(useWorkspaceStore.getState().nodes.length).toBe(
      demoSnapshot().nodes.length,
    );
  });

  it("startRuntimeHandoff is blocked while inquiryInflight", async () => {
    const card = useWorkspaceStore.getState().focusId;
    const before = useWorkspaceStore.getState().turnsByCardId[card]!.length;
    const controller = new AbortController();
    useWorkspaceStore.setState({
      inquiryInflight: {
        cardId: card,
        turnId: "t_fake",
        gen: "g_fake",
        controller,
      },
    });
    await useWorkspaceStore.getState().startRuntimeHandoff({ runtimeId: "mock" });
    expect(useWorkspaceStore.getState().turnsByCardId[card]!.length).toBe(before);
    expect(useWorkspaceStore.getState().runtimeRun).toBeNull();
    // cleanup so later tests are not poisoned
    controller.abort();
    useWorkspaceStore.setState({ inquiryInflight: null });
  });

  it("exportCardBrief returns this-card brief", async () => {
    const card = useWorkspaceStore.getState().focusId;
    const brief = await useWorkspaceStore.getState().exportCardBrief();
    expect(brief.version).toBe(1);
    expect(brief.cardId).toBe(card);
    expect(brief.instructions).toBeTruthy();
    expect(Array.isArray(brief.messages)).toBe(true);
  });
});

describe("workspaceStore docSession (PEL-156 D3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatPortMocks.override = null;
    useWorkspaceStore.getState().setWorkspaceMode("focus");
    useWorkspaceStore.getState().loadSnapshot(demoSnapshot());
    useWorkspaceStore.getState().setWorkspaceMode("focus");
  });

  it("openDoc loads demo/welcome.md via browser mock without Tauri", async () => {
    const focus = useWorkspaceStore.getState().focusId;
    await useWorkspaceStore.getState().openDoc("demo/welcome.md");
    const doc = useWorkspaceStore.getState().docSession;
    expect(doc.status).toBe("ready");
    expect(doc.ref?.pathRel).toBe("demo/welcome.md");
    expect(doc.ref?.kind).toBe("md");
    expect(doc.textContent).toContain("陪读");
    expect(doc.boundCardId).toBe(focus);
    expect(doc.error).toBeNull();
  });

  it("openDoc on unknown path yields universe_closed error", async () => {
    await useWorkspaceStore.getState().openDoc("notes/missing.md");
    const doc = useWorkspaceStore.getState().docSession;
    expect(doc.status).toBe("error");
    expect(doc.error).toBe("universe_closed");
    expect(doc.textContent).toBeNull();
  });

  it("setWorkspaceMode map force_closes docSession", async () => {
    await useWorkspaceStore.getState().openDoc("demo/welcome.md");
    expect(useWorkspaceStore.getState().docSession.status).toBe("ready");
    const epochBefore = useWorkspaceStore.getState().docSession.epoch;
    useWorkspaceStore.getState().setWorkspaceMode("map");
    const doc = useWorkspaceStore.getState().docSession;
    expect(useWorkspaceStore.getState().workspaceMode).toBe("map");
    expect(doc.status).toBe("closed");
    expect(doc.ref).toBeNull();
    expect(doc.textContent).toBeNull();
    expect(doc.epoch).toBeGreaterThan(epochBefore);
  });

  it("toggleMapMode into map force_closes docSession", async () => {
    // loadSnapshot may keep prior map for demo — pin focus first.
    useWorkspaceStore.getState().setWorkspaceMode("focus");
    await useWorkspaceStore.getState().openDoc("demo/welcome.md");
    expect(useWorkspaceStore.getState().docSession.status).toBe("ready");
    useWorkspaceStore.getState().toggleMapMode();
    expect(useWorkspaceStore.getState().workspaceMode).toBe("map");
    expect(useWorkspaceStore.getState().docSession.status).toBe("closed");
    // back to focus does not reopen
    useWorkspaceStore.getState().toggleMapMode();
    expect(useWorkspaceStore.getState().workspaceMode).toBe("focus");
    expect(useWorkspaceStore.getState().docSession.status).toBe("closed");
  });

  it("loadSnapshot always force_closes docSession", async () => {
    await useWorkspaceStore.getState().openDoc("demo/welcome.md");
    expect(useWorkspaceStore.getState().docSession.status).toBe("ready");
    const epochBefore = useWorkspaceStore.getState().docSession.epoch;
    useWorkspaceStore.getState().loadSnapshot(demoSnapshot());
    const doc = useWorkspaceStore.getState().docSession;
    expect(doc.status).toBe("closed");
    expect(doc.ref).toBeNull();
    expect(doc.textContent).toBeNull();
    expect(doc.requestPath).toBeNull();
    expect(doc.epoch).toBeGreaterThan(epochBefore);
  });

  it("focusNode rebinds boundCardId when tied to previous focus", async () => {
    const s0 = useWorkspaceStore.getState();
    const from = s0.focusId;
    await s0.openDoc("demo/welcome.md");
    expect(useWorkspaceStore.getState().docSession.boundCardId).toBe(from);
    useWorkspaceStore.getState().focusNode("c2");
    const doc = useWorkspaceStore.getState().docSession;
    expect(doc.status).toBe("ready");
    expect(doc.boundCardId).toBe("c2");
    expect(doc.ref?.pathRel).toBe("demo/welcome.md");
  });

  it("setDocLayout updates layout when ready", async () => {
    await useWorkspaceStore.getState().openDoc("demo/welcome.md");
    useWorkspaceStore.getState().setDocLayout("doc-wide");
    expect(useWorkspaceStore.getState().docSession.layout).toBe("doc-wide");
  });

  it("retryDoc reloads after error", async () => {
    await useWorkspaceStore.getState().openDoc("notes/nope.md");
    expect(useWorkspaceStore.getState().docSession.status).toBe("error");
    // Swap requestPath via a successful open path: force error then open welcome fails?
    // retry keeps requestPath — still nope → still error
    await useWorkspaceStore.getState().retryDoc();
    expect(useWorkspaceStore.getState().docSession.status).toBe("error");
    expect(useWorkspaceStore.getState().docSession.requestPath).toBe(
      "notes/nope.md",
    );
  });
});

describe("workspaceStore materialsRail (M3)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    chatPortMocks.override = null;
    const { __resetMockMaterialsForTests } = await import("../lib/host");
    __resetMockMaterialsForTests();
    useWorkspaceStore.getState().setWorkspaceMode("focus");
    useWorkspaceStore.getState().loadSnapshot(demoSnapshot());
    useWorkspaceStore.getState().setWorkspaceMode("focus");
    useWorkspaceStore.getState().closeMaterialsRail();
  });

  it("openMaterialsRail starts with empty materials list (no silent demo seed)", async () => {
    useWorkspaceStore.getState().openMaterialsRail();
    // list is async
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().materialsRail.listStatus).toBe(
        "ready",
      );
    });
    const rail = useWorkspaceStore.getState().materialsRail;
    expect(rail.open).toBe(true);
    expect(rail.entries).toEqual([]);
    expect(rail.error).toBeNull();
  });

  it("toggleMaterialsRail closes companion and ends preview (one surface)", async () => {
    await useWorkspaceStore.getState().openDoc("demo/welcome.md");
    expect(useWorkspaceStore.getState().docSession.status).toBe("ready");

    useWorkspaceStore.getState().toggleMaterialsRail();
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().materialsRail.open).toBe(true);
      expect(useWorkspaceStore.getState().materialsRail.view).toBe("list");
      expect(useWorkspaceStore.getState().materialsRail.listStatus).toBe(
        "ready",
      );
    });
    useWorkspaceStore.getState().toggleMaterialsRail();
    expect(useWorkspaceStore.getState().materialsRail.open).toBe(false);
    // Shared pane: closing materials also closes doc preview.
    const docStatus = useWorkspaceStore.getState().docSession.status;
    expect(docStatus === "closing" || docStatus === "closed").toBe(true);
  });

  it("selectMaterial map→focus then openDoc as preview view", async () => {
    useWorkspaceStore.getState().setWorkspaceMode("map");
    // Re-open rail while already on map (force_close only on enter map).
    useWorkspaceStore.getState().openMaterialsRail();
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().materialsRail.listStatus).toBe(
        "ready",
      );
    });
    expect(useWorkspaceStore.getState().workspaceMode).toBe("map");

    await useWorkspaceStore.getState().selectMaterial("demo/welcome.md");
    const s = useWorkspaceStore.getState();
    expect(s.workspaceMode).toBe("focus");
    expect(s.materialsRail.open).toBe(true);
    expect(s.materialsRail.view).toBe("preview");
    expect(s.materialsRail.selectedPathRel).toBe("demo/welcome.md");
    expect(s.docSession.status).toBe("ready");
    expect(s.docSession.ref?.pathRel).toBe("demo/welcome.md");
  });

  it("loadSnapshot force_closes materials rail", async () => {
    useWorkspaceStore.getState().openMaterialsRail();
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().materialsRail.open).toBe(true);
    });
    const epochBefore = useWorkspaceStore.getState().materialsRail.listEpoch;
    useWorkspaceStore.getState().loadSnapshot(demoSnapshot());
    const rail = useWorkspaceStore.getState().materialsRail;
    expect(rail.open).toBe(false);
    expect(rail.listEpoch).toBeGreaterThan(epochBefore);
  });

  it("setWorkspaceMode map force_closes materials rail", async () => {
    useWorkspaceStore.getState().openMaterialsRail();
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().materialsRail.open).toBe(true);
    });
    useWorkspaceStore.getState().setWorkspaceMode("map");
    expect(useWorkspaceStore.getState().materialsRail.open).toBe(false);
    // focus does not re-open
    useWorkspaceStore.getState().setWorkspaceMode("focus");
    expect(useWorkspaceStore.getState().materialsRail.open).toBe(false);
  });

  it("toggleMapMode into map force_closes materials rail", async () => {
    useWorkspaceStore.getState().setWorkspaceMode("focus");
    useWorkspaceStore.getState().openMaterialsRail();
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().materialsRail.open).toBe(true);
    });
    useWorkspaceStore.getState().toggleMapMode();
    expect(useWorkspaceStore.getState().workspaceMode).toBe("map");
    expect(useWorkspaceStore.getState().materialsRail.open).toBe(false);
  });

  it("importMaterials appends mock entry, refresh, opens first success", async () => {
    useWorkspaceStore.getState().openMaterialsRail();
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().materialsRail.listStatus).toBe(
        "ready",
      );
    });
    const body = "# imported note\nhello materials";
    const bytesBase64 = btoa(body);
    await useWorkspaceStore.getState().importMaterials([
      { fileName: "note.md", bytesBase64, size: body.length },
    ]);
    const s = useWorkspaceStore.getState();
    expect(s.materialsRail.importBusy).toBe(false);
    expect(
      s.materialsRail.entries.some((e) => e.pathRel === "materials/note.md"),
    ).toBe(true);
    expect(s.materialsRail.selectedPathRel).toBe("materials/note.md");
    expect(s.docSession.status).toBe("ready");
    expect(s.docSession.ref?.pathRel).toBe("materials/note.md");
    expect(s.docSession.textContent).toContain("imported note");
  });

  it("importMaterials skips oversize by FE size precheck", async () => {
    useWorkspaceStore.getState().openMaterialsRail();
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().materialsRail.listStatus).toBe(
        "ready",
      );
    });
    const before = useWorkspaceStore.getState().materialsRail.entries.length;
    await useWorkspaceStore.getState().importMaterials([
      {
        fileName: "huge.md",
        bytesBase64: btoa("x"),
        size: 2_000_001,
      },
    ]);
    const rail = useWorkspaceStore.getState().materialsRail;
    expect(rail.entries.length).toBe(before);
    expect(rail.entries.some((e) => e.name === "huge.md")).toBe(false);
    expect(rail.importBusy).toBe(false);
  });

  it("import mock host rejects decoded >2MB", async () => {
    const { importVaultMaterial, MAX_MATERIAL_IMPORT_BYTES } = await import(
      "../lib/host"
    );
    const realAtob = globalThis.atob;
    // Proxy avoids allocating a real 2MB+ string in the test process.
    globalThis.atob = () =>
      new Proxy(
        { length: MAX_MATERIAL_IMPORT_BYTES + 1 },
        {
          get(target, prop) {
            if (prop === "length") return target.length;
            if (prop === "charCodeAt") return () => 0;
            return Reflect.get(target, prop as string);
          },
        },
      ) as unknown as string;
    try {
      const r = await importVaultMaterial({
        fileName: "big.bin",
        bytesBase64: "AA==",
      });
      expect(r.ok).toBe(false);
      expect(r.error).toBe("file_too_large");
    } finally {
      globalThis.atob = realAtob;
    }
  });

  it("setTurnStarred + jumpToStarredTurn in demo", async () => {
    const s0 = useWorkspaceStore.getState();
    expect(s0.turnsByCardId.c3?.find((t) => t.id === "c3_t1")?.starred).toBe(
      true,
    );
    await s0.setTurnStarred("c3_t1", false, "c3");
    expect(
      useWorkspaceStore.getState().turnsByCardId.c3?.find((t) => t.id === "c3_t1")
        ?.starred,
    ).toBe(false);
    await useWorkspaceStore.getState().setTurnStarred("c1_t0", true, "c1");
    expect(
      useWorkspaceStore.getState().turnsByCardId.c1?.find((t) => t.id === "c1_t0")
        ?.starred,
    ).toBe(true);

    useWorkspaceStore.getState().jumpToStarredTurn("c1", "c1_t0");
    const s = useWorkspaceStore.getState();
    expect(s.focusId).toBe("c1");
    expect(s.highlightSpan?.turnId).toBe("c1_t0");
    expect(s.materialsRail.open).toBe(true);
    expect(s.materialsRail.section).toBe("stars");
  });
});

describe("layoutGraph", () => {
  it("places demo nodes inside viewBox 0..200 x 0..300", () => {
    const laid = layoutGraph(demoSnapshot().nodes);
    expect(laid.length).toBe(6);
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
