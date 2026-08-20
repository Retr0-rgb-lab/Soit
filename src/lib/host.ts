import type {
  AppendResidueResult,
  AppendTurnArgs,
  AppendTurnResult,
  BootstrapState,
  ChatConfig,
  DeleteTurnArgs,
  HostMutationResult,
  OpenUniverseResult,
  PrecipitateConceptResult,
  SelectVaultResult,
  SkillInfo,
  SpawnInquiryHostArgs,
  UpdateCardArgs,
  UpdateTurnArgs,
  WorkspaceSnapshot,
} from "../types";
import {
  normalizeChatConfig,
  readChatConfigFromLocalStorage,
  writeChatConfigToLocalStorage,
} from "./chat/config";

function hasTauri(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

export async function getBootstrapState(): Promise<BootstrapState> {
  if (!hasTauri()) {
    return {
      phase: "ready_ui",
      vault: null,
      lastVault: null,
      version: "dev-mock",
    };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<BootstrapState>("get_bootstrap_state");
}

/** App-config last vault path (not universe.db). Bootstrap-safe. */
export async function getLastVault(): Promise<string | null> {
  if (!hasTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("get_last_vault");
}

/** Persist or clear last vault in app config. closeUniverse does not clear. */
export async function setLastVault(path: string | null): Promise<void> {
  if (!hasTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_last_vault", { path });
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

/** Host `append_turn` — Host generates `t_*` id (Spec §5.1). */
export async function appendTurn(
  args: AppendTurnArgs,
): Promise<AppendTurnResult> {
  if (!hasTauri()) {
    throw new Error("append_turn requires tauri");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<AppendTurnResult>("append_turn", {
    cardId: args.cardId,
    title: args.title,
    user: args.user,
    quote: args.quote,
  });
}

/** Host `update_turn` — patch only provided fields; never creates nodes. */
export async function updateTurn(
  args: UpdateTurnArgs,
): Promise<HostMutationResult> {
  if (!hasTauri()) {
    throw new Error("update_turn requires tauri");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<HostMutationResult>("update_turn", {
    cardId: args.cardId,
    turnId: args.turnId,
    aiHtml: args.aiHtml,
    think: args.think,
    thinkOpen: args.thinkOpen,
    collapsed: args.collapsed,
    title: args.title,
    user: args.user,
  });
}

/** Host `delete_turn`. */
export async function deleteTurn(
  args: DeleteTurnArgs,
): Promise<HostMutationResult> {
  if (!hasTauri()) {
    throw new Error("delete_turn requires tauri");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<HostMutationResult>("delete_turn", {
    cardId: args.cardId,
    turnId: args.turnId,
  });
}

/** Host `update_card` — title/status/question/stuck/next/unread. */
export async function updateCard(
  args: UpdateCardArgs,
): Promise<HostMutationResult> {
  if (!hasTauri()) {
    throw new Error("update_card requires tauri");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<HostMutationResult>("update_card", {
    cardId: args.cardId,
    title: args.title,
    status: args.status,
    question: args.question,
    stuck: args.stuck,
    next: args.next,
    unread: args.unread,
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

/**
 * BYOK chat config — never universe.db.
 * Tauri: `{app_config_dir}/soit-chat.json`. Browser: localStorage only.
 */
export async function getChatConfig(): Promise<ChatConfig> {
  if (!hasTauri()) {
    return readChatConfigFromLocalStorage();
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = await invoke<Partial<ChatConfig>>("get_chat_config");
    return normalizeChatConfig(raw);
  } catch {
    return readChatConfigFromLocalStorage();
  }
}

export async function setChatConfig(config: ChatConfig): Promise<void> {
  const cfg = normalizeChatConfig(config);
  // Always mirror to localStorage so browser/dev and resolvePort stay in sync.
  writeChatConfigToLocalStorage(cfg);
  if (!hasTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_chat_config", { config: cfg });
  } catch {
    // localStorage already written
  }
}
