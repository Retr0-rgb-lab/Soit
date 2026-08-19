import type {
  BootstrapState,
  OpenUniverseResult,
  SelectVaultResult,
  WorkspaceSnapshot,
} from "../types";

function hasTauri(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

export async function getBootstrapState(): Promise<BootstrapState> {
  if (!hasTauri()) {
    return { phase: "ready_ui", vault: null, version: "dev-mock" };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<BootstrapState>("get_bootstrap_state");
}

/**
 * Host snapshot. Unbound → source "demo" (nodes may be empty).
 * Bound empty universe → source "empty". Bound with cards → "universe".
 */
export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  if (!hasTauri()) {
    const { demoSnapshot } = await import("./demoSeed");
    return demoSnapshot();
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<WorkspaceSnapshot>("get_workspace_snapshot");
}

/** @deprecated Prefer openUniverse — thin Host wrapper. */
export async function selectVault(path: string): Promise<SelectVaultResult> {
  if (!hasTauri()) {
    return { ok: false, path, error: "select_vault requires tauri" };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<SelectVaultResult>("select_vault", { path });
}

export async function openUniverse(path: string): Promise<OpenUniverseResult> {
  if (!hasTauri()) {
    return {
      ok: false,
      path,
      error: "open_universe requires tauri (browser stays on demo)",
    };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<OpenUniverseResult>("open_universe", { path });
}

export async function closeUniverse(): Promise<void> {
  if (!hasTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("close_universe");
}

export async function createRootInquiry(
  title: string,
  question?: string,
): Promise<WorkspaceSnapshot> {
  if (!hasTauri()) {
    throw new Error("create_root_inquiry requires tauri");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<WorkspaceSnapshot>("create_root_inquiry", {
    title,
    question: question ?? null,
  });
}
