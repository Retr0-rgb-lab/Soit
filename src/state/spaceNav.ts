/**
 * Space navigation: shellPhase enter / leave / switch / forget.
 * Spec: workspace-hall v1.1 §2.1 §2.5 — navEpoch via beginBootLoad.
 */

import {
  DEMO_WORKSPACE_PATH,
  demoSnapshot,
  isDemoWorkspacePath,
  unboundEmptySnapshot,
} from "../lib/demoSeed";
import { removeRecentVault } from "../lib/sessionConfig";
import type { OpenUniverseResult, SessionConfig, WorkspaceSnapshot } from "../types";
import type { StoreGet, StoreSet } from "./turnHelpers";
import type { WorkspaceState } from "./workspaceStore";

export type ShellPhase =
  | "picker"
  | "entering"
  | "workspace"
  | "leaving"
  | "error";

export function isSpaceBusyPhase(phase: ShellPhase): boolean {
  return phase === "entering" || phase === "leaving";
}

function mapOpenError(err: string | undefined): string {
  const raw = (err ?? "打开失败").trim();
  if (
    /requires tauri/i.test(raw) ||
    /tauri-missing/i.test(raw) ||
    /browser stays on demo/i.test(raw)
  ) {
    return "需要桌面版";
  }
  return raw || "打开失败";
}

function pathsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = (a ?? "").trim();
  const tb = (b ?? "").trim();
  if (!ta || !tb) return false;
  return ta === tb;
}

function applyPhase(
  set: StoreSet,
  phase: ShellPhase,
  extra?: Partial<WorkspaceState>,
): void {
  set({
    shellPhase: phase,
    spaceBusy: isSpaceBusyPhase(phase),
    ...extra,
  });
}

function epochLive(get: StoreGet, epoch: number): boolean {
  return get().bootEpoch === epoch;
}

/** Stale open ok → must close Host; fail ignored (spec §2.1). */
async function closeIfStaleOpen(
  res: OpenUniverseResult,
  epoch: number,
  get: StoreGet,
): Promise<boolean> {
  if (epochLive(get, epoch)) return false;
  if (res.ok) {
    try {
      const { closeUniverse } = await import("../lib/host");
      await closeUniverse();
    } catch {
      /* ignore close failure on stale */
    }
  }
  return true;
}

async function refreshSession(get: StoreGet, set: StoreSet, epoch: number): Promise<void> {
  try {
    const { getSessionConfig } = await import("../lib/host");
    const session = await getSessionConfig();
    if (!epochLive(get, epoch)) return;
    set({ sessionConfig: session });
  } catch {
    /* non-fatal */
  }
}

function emptyBoundSnapshot(): WorkspaceSnapshot {
  return {
    source: "empty",
    focusId: "",
    nodes: [],
    edges: [],
    turnsByCardId: {},
  };
}

async function runOpenPath(
  get: StoreGet,
  set: StoreSet,
  path: string,
  epoch: number,
): Promise<void> {
  const host = await import("../lib/host");
  const current = get().vaultPath;

  if (current && !pathsEqual(current, path)) {
    await host.closeUniverse();
    if (!epochLive(get, epoch)) return;
  }

  let res: OpenUniverseResult;
  try {
    res = await host.openUniverse(path);
  } catch (e) {
    if (!epochLive(get, epoch)) return;
    const msg = mapOpenError(e instanceof Error ? e.message : String(e));
    applyPhase(set, "error", {
      enterError: msg,
      vaultPath: null,
    });
    get().loadSnapshot(unboundEmptySnapshot(), epoch);
    return;
  }

  if (await closeIfStaleOpen(res, epoch, get)) return;

  if (!res.ok) {
    applyPhase(set, "error", {
      enterError: mapOpenError(res.error),
      vaultPath: null,
    });
    get().loadSnapshot(unboundEmptySnapshot(), epoch);
    return;
  }

  const boundPath = (res.path || path).trim();
  set({ vaultPath: boundPath, enterError: null });
  const snap = res.snapshot ?? emptyBoundSnapshot();
  get().loadSnapshot(snap, epoch);
  if (!epochLive(get, epoch)) {
    // loadSnapshot ignored or superseded mid-flight — still must not leave Host open alone
    try {
      await host.closeUniverse();
    } catch {
      /* ignore */
    }
    return;
  }

  await refreshSession(get, set, epoch);
  if (!epochLive(get, epoch)) return;

  applyPhase(set, "workspace", { enterError: null });
}

export interface SpaceNavActions {
  enter: (path: string) => Promise<void>;
  /** Browser FE: load in-memory demo cards; never writes lastVault. */
  enterDemo: () => Promise<void>;
  leave: () => Promise<void>;
  switch: (path: string) => Promise<void>;
  forget: (path: string) => Promise<void>;
  dismissEnterError: () => void;
}

export function createSpaceNavActions(
  set: StoreSet,
  get: StoreGet,
): SpaceNavActions {
  return {
    enter: async (path) => {
      const t = path.trim();
      if (!t) return;
      const s0 = get();
      if (s0.spaceBusy || isSpaceBusyPhase(s0.shellPhase)) return;
      if (
        s0.shellPhase === "workspace" &&
        pathsEqual(s0.vaultPath, t)
      ) {
        return;
      }

      const epoch = get().beginBootLoad();
      applyPhase(set, "entering", { enterError: null });

      try {
        await runOpenPath(get, set, t, epoch);
      } catch (e) {
        if (!epochLive(get, epoch)) return;
        applyPhase(set, "error", {
          enterError: mapOpenError(
            e instanceof Error ? e.message : String(e),
          ),
          vaultPath: null,
        });
        get().loadSnapshot(unboundEmptySnapshot(), epoch);
      }
    },

    enterDemo: async () => {
      const s0 = get();
      if (s0.spaceBusy || isSpaceBusyPhase(s0.shellPhase)) return;
      if (
        s0.shellPhase === "workspace" &&
        isDemoWorkspacePath(s0.vaultPath)
      ) {
        return;
      }

      const epoch = get().beginBootLoad();
      applyPhase(set, "entering", { enterError: null });

      try {
        // Leave a real Host vault if any (desktop dev), then stay in-memory.
        if (s0.vaultPath && !isDemoWorkspacePath(s0.vaultPath)) {
          try {
            const { closeUniverse } = await import("../lib/host");
            await closeUniverse();
          } catch {
            /* ignore */
          }
          if (!epochLive(get, epoch)) return;
        }

        const snap = demoSnapshot();
        set({ vaultPath: DEMO_WORKSPACE_PATH, enterError: null });
        get().loadSnapshot(snap, epoch);
        if (!epochLive(get, epoch)) return;
        // Never write lastVault / recents for mock hall entry.
        applyPhase(set, "workspace", { enterError: null });
      } catch (e) {
        if (!epochLive(get, epoch)) return;
        applyPhase(set, "error", {
          enterError:
            (e instanceof Error ? e.message : String(e)).trim() ||
            "打开演示失败",
          vaultPath: null,
        });
        get().loadSnapshot(unboundEmptySnapshot(), epoch);
      }
    },

    leave: async () => {
      const s0 = get();
      if (s0.shellPhase !== "workspace") return;
      if (s0.spaceBusy || isSpaceBusyPhase(s0.shellPhase)) return;

      const epoch = get().beginBootLoad();
      applyPhase(set, "leaving", { enterError: null });

      try {
        const demo = isDemoWorkspacePath(s0.vaultPath);
        if (!demo) {
          const { closeUniverse } = await import("../lib/host");
          await closeUniverse();
        }
        if (!epochLive(get, epoch)) return;
        set({ vaultPath: null });
        get().loadSnapshot(unboundEmptySnapshot(), epoch);
        if (!epochLive(get, epoch)) return;
        // leave / close_universe does not clear lastVault (Host authority).
        applyPhase(set, "picker", { enterError: null });
      } catch (e) {
        if (!epochLive(get, epoch)) return;
        const msg = e instanceof Error ? e.message : String(e);
        applyPhase(set, "workspace", {
          enterError: msg || "退出失败",
        });
      }
    },

    switch: async (path) => {
      const t = path.trim();
      if (!t) return;
      const s0 = get();
      if (s0.spaceBusy || isSpaceBusyPhase(s0.shellPhase)) return;
      if (pathsEqual(s0.vaultPath, t)) return;

      const epoch = get().beginBootLoad();
      // Same transaction: skip picker flash (leaving → entering).
      applyPhase(set, "entering", { enterError: null });

      try {
        await runOpenPath(get, set, t, epoch);
      } catch (e) {
        if (!epochLive(get, epoch)) return;
        applyPhase(set, "error", {
          enterError: mapOpenError(
            e instanceof Error ? e.message : String(e),
          ),
          vaultPath: null,
        });
        get().loadSnapshot(unboundEmptySnapshot(), epoch);
      }
    },

    forget: async (path) => {
      const t = path.trim();
      if (!t) return;
      try {
        const { getSessionConfig, setSessionConfig } = await import(
          "../lib/host"
        );
        const cur = await getSessionConfig();
        const next = removeRecentVault(cur, t);
        await setSessionConfig(next);
        set({ sessionConfig: next satisfies SessionConfig });
      } catch (e) {
        console.error("[soit] forget vault failed", e);
      }
    },

    dismissEnterError: () => {
      const s0 = get();
      if (s0.shellPhase !== "error" && s0.enterError == null) return;
      if (s0.spaceBusy || isSpaceBusyPhase(s0.shellPhase)) return;
      applyPhase(set, "picker", { enterError: null });
      if (s0.vaultPath != null) {
        // Should not happen in error; keep invariant.
        set({ vaultPath: null });
      }
    },
  };
}
