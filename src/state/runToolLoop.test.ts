import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatCompleteInput, ChatPort } from "../lib/chat";
import type { WorkspaceState } from "./workspaceStore";

const hostMocks = vi.hoisted(() => ({
  invokeInquiryTool: vi.fn(),
  getEnabledSkillsText: vi.fn(async () => ""),
  updateTurn: vi.fn(),
}));

const chatPortMocks = vi.hoisted(() => ({
  resolvePort: vi.fn(),
}));

const toolsMocks = vi.hoisted(() => ({
  getToolsPrefs: vi.fn(),
}));

vi.mock("../lib/host", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/host")>();
  return {
    ...actual,
    invokeInquiryTool: hostMocks.invokeInquiryTool,
    getEnabledSkillsText: hostMocks.getEnabledSkillsText,
    updateTurn: hostMocks.updateTurn,
  };
});

vi.mock("../lib/chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/chat")>();
  return {
    ...actual,
    resolvePort: (...args: unknown[]) => chatPortMocks.resolvePort(...args),
  };
});

vi.mock("../lib/tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/tools")>();
  return {
    ...actual,
    getToolsPrefs: (...args: unknown[]) => toolsMocks.getToolsPrefs(...args),
  };
});

import { runToolAwareCompletion, stillCurrent } from "./runToolLoop";

function makeStore(turnId: string, cardId: string, gen = "g1") {
  const controller = new AbortController();
  let state = {
    source: "demo" as const,
    focusId: cardId,
    turnsByCardId: {
      [cardId]: [
        {
          id: turnId,
          title: "t",
          collapsed: false,
          user: "搜索 函子",
          aiHtml: "",
          think: "生成中…",
          thinkOpen: false,
          process: [],
        },
      ],
    },
    inquiryInflight: {
      cardId,
      turnId,
      gen,
      controller,
    },
  } as unknown as WorkspaceState;

  const get = () => state;
  const set = (
    partial:
      | Partial<WorkspaceState>
      | ((s: WorkspaceState) => Partial<WorkspaceState>),
  ) => {
    const p = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...p } as WorkspaceState;
    if (p.turnsByCardId) {
      state = { ...state, turnsByCardId: p.turnsByCardId } as WorkspaceState;
    }
  };

  return {
    get,
    set,
    getState: () => state,
    controller,
    /** Mutate inflight gen to simulate cancel/supersede. */
    bumpGen(next: string | null) {
      if (next == null) {
        state = { ...state, inquiryInflight: null } as WorkspaceState;
      } else {
        state = {
          ...state,
          inquiryInflight: state.inquiryInflight
            ? { ...state.inquiryInflight, gen: next }
            : null,
        } as WorkspaceState;
      }
    },
  };
}

function defaultPrefs(over: Record<string, unknown> = {}) {
  return {
    version: 1 as const,
    toolsEnabled: true,
    maxToolRounds: 3,
    webSearchBackend: "off" as const,
    tavilyApiKey: "",
    allowLoopbackFetch: false,
    ...over,
  };
}

afterEach(() => {
  hostMocks.invokeInquiryTool.mockReset();
  hostMocks.getEnabledSkillsText.mockReset();
  hostMocks.getEnabledSkillsText.mockResolvedValue("");
  hostMocks.updateTurn.mockReset();
  chatPortMocks.resolvePort.mockReset();
  toolsMocks.getToolsPrefs.mockReset();
});

describe("stillCurrent", () => {
  it("true when gen owns inflight and turn exists", () => {
    const { get } = makeStore("t1", "c1", "g1");
    expect(stillCurrent(get, "c1", "t1", "g1")).toBe(true);
  });

  it("false when gen mismatches or turn missing", () => {
    const store = makeStore("t1", "c1", "g1");
    expect(stillCurrent(store.get, "c1", "t1", "other")).toBe(false);
    store.bumpGen(null);
    expect(stillCurrent(store.get, "c1", "t1", "g1")).toBe(false);
  });
});

describe("runToolAwareCompletion", () => {
  it("runs vault_search then final answer and patches process + aiHtml", async () => {
    const cardId = "c1";
    const turnId = "t1";
    const { get, set, getState, controller } = makeStore(turnId, cardId);

    toolsMocks.getToolsPrefs.mockResolvedValue(defaultPrefs());
    hostMocks.invokeInquiryTool.mockResolvedValue({
      ok: true,
      title: "检索库内",
      summary: "函子 · 2 hits",
      content: "hit: materials/functor.md",
    });

    let hop = 0;
    const port: ChatPort = {
      async complete(input) {
        hop += 1;
        if (hop === 1) {
          expect(input.tools?.some((t) => t.name === "vault_search")).toBe(
            true,
          );
          expect(input.toolChoice).toBe("auto");
          expect(input.wireMessages?.length).toBeGreaterThan(0);
          return {
            text: "",
            think: "need search",
            toolCalls: [
              {
                id: "call_1",
                name: "vault_search",
                arguments: JSON.stringify({ query: "函子" }),
              },
            ],
          };
        }
        expect(input.wireMessages?.some((m) => m.role === "tool")).toBe(true);
        const toolMsg = input.wireMessages?.find((m) => m.role === "tool");
        expect(toolMsg && "content" in toolMsg && toolMsg.content).toContain(
          "functor",
        );
        return {
          text: "终答 [[函子]]",
          think: "done",
          marks: [{ term: "函子" }],
        };
      },
    };
    chatPortMocks.resolvePort.mockResolvedValue(port);

    await runToolAwareCompletion({
      get,
      set,
      cardId,
      turnId,
      messages: [{ role: "user", content: "搜索 函子" }],
      scope: null,
      gen: "g1",
      signal: controller.signal,
    });

    expect(hop).toBe(2);
    expect(hostMocks.invokeInquiryTool).toHaveBeenCalledWith(
      "vault_search",
      JSON.stringify({ query: "函子" }),
    );

    const turn = getState().turnsByCardId[cardId]?.[0];
    expect(turn).toBeTruthy();
    expect(turn!.aiHtml).toContain("终答");
    expect(turn!.aiHtml).toContain('data-term="函子"');
    expect(turn!.process?.some((s) => s.kind === "think")).toBe(true);
    expect(
      turn!.process?.some(
        (s) => s.kind === "vault_search" && s.status === "ok",
      ),
    ).toBe(true);
    expect(turn!.think).toContain("need search");
  });

  it("skips tools when prefs.toolsEnabled is false", async () => {
    const cardId = "c1";
    const turnId = "t1";
    const { get, set, getState, controller } = makeStore(turnId, cardId);

    toolsMocks.getToolsPrefs.mockResolvedValue(
      defaultPrefs({ toolsEnabled: false }),
    );

    const complete = vi.fn(async (_input: ChatCompleteInput) => ({
      text: "plain answer",
      marks: [{ term: "函子" }],
    }));
    chatPortMocks.resolvePort.mockResolvedValue({ complete } satisfies ChatPort);

    await runToolAwareCompletion({
      get,
      set,
      cardId,
      turnId,
      messages: [{ role: "user", content: "搜索 函子" }],
      scope: null,
      gen: "g1",
      signal: controller.signal,
    });

    expect(complete).toHaveBeenCalledOnce();
    const arg = complete.mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    expect(arg!.tools).toBeUndefined();
    expect(arg!.toolChoice).toBe("none");
    expect(hostMocks.invokeInquiryTool).not.toHaveBeenCalled();
    expect(getState().turnsByCardId[cardId]?.[0]?.aiHtml).toContain(
      "plain answer",
    );
  });

  it("does not write when gen is superseded mid-loop", async () => {
    const cardId = "c1";
    const turnId = "t1";
    const store = makeStore(turnId, cardId);

    toolsMocks.getToolsPrefs.mockResolvedValue(defaultPrefs());
    hostMocks.invokeInquiryTool.mockImplementation(async () => {
      store.bumpGen("g2");
      return {
        ok: true,
        title: "检索库内",
        summary: "ok",
        content: "payload",
      };
    });

    let hop = 0;
    chatPortMocks.resolvePort.mockResolvedValue({
      async complete() {
        hop += 1;
        if (hop === 1) {
          return {
            text: "",
            toolCalls: [
              {
                id: "c1",
                name: "vault_search",
                arguments: JSON.stringify({ query: "x" }),
              },
            ],
          };
        }
        return { text: "should not land" };
      },
    } satisfies ChatPort);

    await runToolAwareCompletion({
      get: store.get,
      set: store.set,
      cardId,
      turnId,
      messages: [{ role: "user", content: "搜索 x" }],
      scope: null,
      gen: "g1",
      signal: store.controller.signal,
    });

    const turn = store.getState().turnsByCardId[cardId]?.[0];
    expect(turn?.aiHtml).toBe("");
    expect(hop).toBe(1);
  });

  it("records unknown tool as error step and continues", async () => {
    const cardId = "c1";
    const turnId = "t1";
    const { get, set, getState, controller } = makeStore(turnId, cardId);

    toolsMocks.getToolsPrefs.mockResolvedValue(defaultPrefs());

    let hop = 0;
    chatPortMocks.resolvePort.mockResolvedValue({
      async complete() {
        hop += 1;
        if (hop === 1) {
          return {
            text: "",
            toolCalls: [
              {
                id: "bad",
                name: "not_a_tool",
                arguments: "{}",
              },
            ],
          };
        }
        return { text: "recovered" };
      },
    } satisfies ChatPort);

    await runToolAwareCompletion({
      get,
      set,
      cardId,
      turnId,
      messages: [{ role: "user", content: "hi" }],
      scope: null,
      gen: "g1",
      signal: controller.signal,
    });

    expect(hostMocks.invokeInquiryTool).not.toHaveBeenCalled();
    const process = getState().turnsByCardId[cardId]?.[0]?.process ?? [];
    expect(process.some((s) => s.status === "error")).toBe(true);
    expect(getState().turnsByCardId[cardId]?.[0]?.aiHtml).toContain("recovered");
  });
});
