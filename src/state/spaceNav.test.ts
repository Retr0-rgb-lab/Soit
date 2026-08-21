import { beforeEach, describe, expect, it, vi } from "vitest";
import { unboundEmptySnapshot } from "../lib/demoSeed";
import type { OpenUniverseResult, SessionConfig, WorkspaceSnapshot } from "../types";
import { useWorkspaceStore } from "./workspaceStore";

const hostMocks = vi.hoisted(() => ({
  openUniverse: vi.fn(),
  closeUniverse: vi.fn(),
  getSessionConfig: vi.fn(),
  setSessionConfig: vi.fn(),
}));

vi.mock("../lib/host", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/host")>();
  return {
    ...actual,
    openUniverse: hostMocks.openUniverse,
    closeUniverse: hostMocks.closeUniverse,
    getSessionConfig: hostMocks.getSessionConfig,
    setSessionConfig: hostMocks.setSessionConfig,
  };
});

function session(partial?: Partial<SessionConfig>): SessionConfig {
  return {
    version: 1,
    lastVault: null,
    recentVaults: [],
    ...partial,
  };
}

function emptyUniverseSnap(
  partial?: Partial<WorkspaceSnapshot>,
): WorkspaceSnapshot {
  return {
    source: "empty",
    focusId: "",
    nodes: [],
    edges: [],
    turnsByCardId: {},
    ...partial,
  };
}

function okOpen(
  path: string,
  snap?: WorkspaceSnapshot,
): OpenUniverseResult {
  return {
    ok: true,
    path,
    snapshot: snap ?? emptyUniverseSnap({ source: "universe", focusId: "c1", nodes: [
      {
        id: "c1",
        title: "root",
        parentId: null,
        kind: "root",
        unread: false,
        status: "active",
      },
    ], turnsByCardId: { c1: [] } }),
  };
}

function resetStoreToPicker(): void {
  const s = useWorkspaceStore.getState();
  // Hard reset hall fields + graph without going through leave IPC.
  useWorkspaceStore.setState({
    nodes: [],
    turnsByCardId: {},
    edges: [],
    focusId: "",
    source: "demo",
    vaultPath: null,
    shellPhase: "picker",
    spaceBusy: false,
    enterError: null,
    sessionConfig: null,
    bootEpoch: 0,
    inquiryInflight: null,
    runtimeRun: null,
  });
  s.loadSnapshot(unboundEmptySnapshot(), 0);
}

describe("spaceNav shellPhase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hostMocks.closeUniverse.mockResolvedValue(undefined);
    hostMocks.getSessionConfig.mockResolvedValue(
      session({ lastVault: "E:\\vaults\\a", recentVaults: ["E:\\vaults\\a"] }),
    );
    hostMocks.setSessionConfig.mockResolvedValue(undefined);
    hostMocks.openUniverse.mockResolvedValue(okOpen("E:\\vaults\\a"));
    resetStoreToPicker();
  });

  it("defaults to picker with unbound empty graph", () => {
    // Fresh store defaults (before beforeEach graph load still picker).
    const fresh = useWorkspaceStore.getState();
    expect(fresh.shellPhase).toBe("picker");
    expect(fresh.spaceBusy).toBe(false);
    expect(fresh.vaultPath).toBeNull();
    expect(fresh.nodes).toEqual([]);
  });

  it("enter fail → error phase, vaultPath null, unbound empty", async () => {
    hostMocks.openUniverse.mockResolvedValue({
      ok: false,
      path: "E:\\missing",
      error: "not found",
    });
    await useWorkspaceStore.getState().enter("E:\\missing");
    const s = useWorkspaceStore.getState();
    expect(s.shellPhase).toBe("error");
    expect(s.spaceBusy).toBe(false);
    expect(s.vaultPath).toBeNull();
    expect(s.enterError).toBe("not found");
    expect(s.nodes).toEqual([]);
    expect(s.source).toBe("demo");
    expect(hostMocks.closeUniverse).not.toHaveBeenCalled();
  });

  it("enter ok → workspace + vaultPath + session refresh", async () => {
    hostMocks.getSessionConfig.mockResolvedValue(
      session({
        lastVault: "E:\\vaults\\a",
        recentVaults: ["E:\\vaults\\a"],
      }),
    );
    await useWorkspaceStore.getState().enter("E:\\vaults\\a");
    const s = useWorkspaceStore.getState();
    expect(s.shellPhase).toBe("workspace");
    expect(s.spaceBusy).toBe(false);
    expect(s.vaultPath).toBe("E:\\vaults\\a");
    expect(s.enterError).toBeNull();
    expect(s.nodes.some((n) => n.id === "c1")).toBe(true);
    expect(s.sessionConfig?.lastVault).toBe("E:\\vaults\\a");
    expect(hostMocks.getSessionConfig).toHaveBeenCalled();
  });

  it("leave → picker + unbound; does not clear lastVault on Host", async () => {
    await useWorkspaceStore.getState().enter("E:\\vaults\\a");
    hostMocks.getSessionConfig.mockClear();
    hostMocks.setSessionConfig.mockClear();

    await useWorkspaceStore.getState().leave();
    const s = useWorkspaceStore.getState();
    expect(s.shellPhase).toBe("picker");
    expect(s.spaceBusy).toBe(false);
    expect(s.vaultPath).toBeNull();
    expect(s.nodes).toEqual([]);
    expect(hostMocks.closeUniverse).toHaveBeenCalled();
    // leave must not rewrite session / lastVault
    expect(hostMocks.setSessionConfig).not.toHaveBeenCalled();
  });

  it("leave fail → back to workspace with enterError", async () => {
    await useWorkspaceStore.getState().enter("E:\\vaults\\a");
    hostMocks.closeUniverse.mockRejectedValueOnce(new Error("close boom"));
    await useWorkspaceStore.getState().leave();
    const s = useWorkspaceStore.getState();
    expect(s.shellPhase).toBe("workspace");
    expect(s.vaultPath).toBe("E:\\vaults\\a");
    expect(s.enterError).toMatch(/close boom/);
  });

  it("busy ignores double enter", async () => {
    let resolveOpen!: (v: OpenUniverseResult) => void;
    hostMocks.openUniverse.mockImplementation(
      () =>
        new Promise<OpenUniverseResult>((resolve) => {
          resolveOpen = resolve;
        }),
    );

    const p1 = useWorkspaceStore.getState().enter("E:\\vaults\\a");
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().shellPhase).toBe("entering");
      expect(hostMocks.openUniverse).toHaveBeenCalledTimes(1);
    });
    expect(useWorkspaceStore.getState().spaceBusy).toBe(true);

    await useWorkspaceStore.getState().enter("E:\\vaults\\b");
    expect(hostMocks.openUniverse).toHaveBeenCalledTimes(1);

    resolveOpen(okOpen("E:\\vaults\\a"));
    await p1;
    expect(useWorkspaceStore.getState().shellPhase).toBe("workspace");
    expect(useWorkspaceStore.getState().vaultPath).toBe("E:\\vaults\\a");
  });

  it("stale open ok → closeUniverse; FE stays unbound/picker", async () => {
    let resolveOpen!: (v: OpenUniverseResult) => void;
    hostMocks.openUniverse.mockImplementation(
      () =>
        new Promise<OpenUniverseResult>((resolve) => {
          resolveOpen = resolve;
        }),
    );

    const p1 = useWorkspaceStore.getState().enter("E:\\vaults\\stale");
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().shellPhase).toBe("entering");
      expect(hostMocks.openUniverse).toHaveBeenCalled();
    });

    // Supersede navEpoch (e.g. another boot / leave / enter started).
    useWorkspaceStore.getState().beginBootLoad();
    // Simulate newer txn settling on picker unbound.
    useWorkspaceStore.setState({
      shellPhase: "picker",
      spaceBusy: false,
      vaultPath: null,
      enterError: null,
    });
    useWorkspaceStore.getState().loadSnapshot(
      unboundEmptySnapshot(),
      useWorkspaceStore.getState().bootEpoch,
    );

    resolveOpen(okOpen("E:\\vaults\\stale"));
    await p1;

    expect(hostMocks.closeUniverse).toHaveBeenCalled();
    const s = useWorkspaceStore.getState();
    // Must not bind FE while Host would otherwise stay open.
    expect(s.vaultPath).toBeNull();
    expect(s.shellPhase).toBe("picker");
    expect(s.nodes).toEqual([]);
  });

  it("switch same path is ignored", async () => {
    await useWorkspaceStore.getState().enter("E:\\vaults\\a");
    hostMocks.openUniverse.mockClear();
    hostMocks.closeUniverse.mockClear();
    await useWorkspaceStore.getState().switch("E:\\vaults\\a");
    expect(hostMocks.openUniverse).not.toHaveBeenCalled();
    expect(hostMocks.closeUniverse).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().shellPhase).toBe("workspace");
  });

  it("switch different path closes then opens", async () => {
    await useWorkspaceStore.getState().enter("E:\\vaults\\a");
    hostMocks.openUniverse.mockResolvedValue(okOpen("E:\\vaults\\b"));
    hostMocks.getSessionConfig.mockResolvedValue(
      session({ lastVault: "E:\\vaults\\b", recentVaults: ["E:\\vaults\\b", "E:\\vaults\\a"] }),
    );

    await useWorkspaceStore.getState().switch("E:\\vaults\\b");
    expect(hostMocks.closeUniverse).toHaveBeenCalled();
    expect(hostMocks.openUniverse).toHaveBeenCalledWith("E:\\vaults\\b");
    const s = useWorkspaceStore.getState();
    expect(s.shellPhase).toBe("workspace");
    expect(s.vaultPath).toBe("E:\\vaults\\b");
  });

  it("forget removes recent and clears lastVault when matched", async () => {
    hostMocks.getSessionConfig.mockResolvedValue(
      session({
        lastVault: "E:\\vaults\\a",
        recentVaults: ["E:\\vaults\\a", "E:\\vaults\\b"],
      }),
    );
    await useWorkspaceStore.getState().forget("E:\\vaults\\a");
    expect(hostMocks.setSessionConfig).toHaveBeenCalledWith(
      session({
        lastVault: null,
        recentVaults: ["E:\\vaults\\b"],
      }),
    );
    expect(useWorkspaceStore.getState().sessionConfig?.recentVaults).toEqual([
      "E:\\vaults\\b",
    ]);
    expect(useWorkspaceStore.getState().sessionConfig?.lastVault).toBeNull();
  });

  it("leave from non-workspace is ignored", async () => {
    await useWorkspaceStore.getState().leave();
    expect(hostMocks.closeUniverse).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().shellPhase).toBe("picker");
  });

  it("enter maps browser/tauri-missing errors to 需要桌面版 + unbound empty", async () => {
    hostMocks.openUniverse.mockResolvedValue({
      ok: false,
      path: "E:\\vaults\\a",
      error: "open_universe requires tauri (browser stays on demo)",
    });
    await useWorkspaceStore.getState().enter("E:\\vaults\\a");
    const s = useWorkspaceStore.getState();
    expect(s.shellPhase).toBe("error");
    expect(s.vaultPath).toBeNull();
    expect(s.enterError).toBe("需要桌面版");
    expect(s.nodes).toEqual([]);
    expect(s.source).toBe("demo");
  });
});
