import type {
  AppendResidueResult,
  BootstrapState,
  OpenUniverseResult,
  PrecipitateConceptResult,
  SelectVaultResult,
  SkillInfo,
  SpawnInquiryHostArgs,
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

/** Wave B — spawn deepen/diverge with SourceSpan edge (universe open). */
export async function spawnInquiry(
  args: SpawnInquiryHostArgs,
): Promise<WorkspaceSnapshot> {
  if (!hasTauri()) {
    throw new Error("spawn_inquiry requires tauri");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<WorkspaceSnapshot>("spawn_inquiry", {
    kind: args.kind,
    fromCardId: args.fromCardId,
    source: args.source,
    why: args.why ?? null,
    actor: args.actor ?? null,
  });
}

/** Write concepts/{slug}.md — requires open universe. */
export async function precipitateConcept(args: {
  cardId: string;
  title: string;
  question?: string | null;
  bodyHint?: string | null;
}): Promise<PrecipitateConceptResult> {
  if (!hasTauri()) {
    return {
      ok: false,
      bodyWritten: false,
      bodySkipped: false,
      error: "precipitate_concept requires tauri + bound vault",
      cardIds: [],
    };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<PrecipitateConceptResult>("precipitate_concept", {
    cardId: args.cardId,
    title: args.title,
    question: args.question ?? null,
    bodyHint: args.bodyHint ?? null,
  });
}

/** Append residue snippet under inquiry/ — requires open universe. */
export async function appendResidue(
  cardId: string,
  text: string,
): Promise<AppendResidueResult> {
  if (!hasTauri()) {
    return {
      ok: false,
      error: "append_residue requires tauri + bound vault",
    };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<AppendResidueResult>("append_residue", { cardId, text });
}

/** Wave E — list SKILL.md skills (requires open universe). */
export async function listSkills(): Promise<SkillInfo[]> {
  if (!hasTauri()) {
    return [];
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<SkillInfo[]>("list_skills");
}

/** Wave E — toggle skill; returns refreshed list. */
export async function setSkillEnabled(
  id: string,
  enabled: boolean,
): Promise<SkillInfo[]> {
  if (!hasTauri()) {
    throw new Error("set_skill_enabled requires tauri + bound vault");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<SkillInfo[]>("set_skill_enabled", { id, enabled });
}

/** Wave E — concat enabled skill bodies for chat inject. */
export async function getEnabledSkillsText(): Promise<string> {
  if (!hasTauri()) {
    return "";
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("get_enabled_skills_text");
}
