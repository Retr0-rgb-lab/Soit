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
  ReadVaultTextResult,
  ResolveVaultDocResult,
  SelectVaultResult,
  SkillInfo,
  SpawnInquiryHostArgs,
  UpdateCardArgs,
  UpdateTurnArgs,
  VaultDocKind,
  WorkspaceSnapshot,
} from "../types";
import {
  normalizeChatConfig,
  readChatConfigFromLocalStorage,
  writeChatConfigToLocalStorage,
} from "./chat/config";
import type {
  CancelHandoffResult,
  HandoffResult,
  RuntimeInfo,
  RuntimePreferences,
  StartRuntimeHandoffArgs,
} from "./runtime/types";
import {
  MOCK_HANDOFF_TEXT,
  MOCK_RUNTIME_INFO,
} from "./runtime/types";
import {
  normalizeRuntimePrefs,
  readRuntimePrefsFromLocalStorage,
  writeRuntimePrefsToLocalStorage,
} from "./runtime/prefs";

/** Browser-only mock handoff cancel flag (at most one in-flight). */
let browserHandoffCancel = false;
let browserHandoffActive = false;

/** Browser mock vault docs (PEL-156) — no Tauri / no real vault. */
const MOCK_WELCOME_MD = `# 欢迎

这是 Soit 陪读演示文档（浏览器 mock）。

你可以在专注模式下并排阅读材料，划词后引用、解释或深挖发散。
`;

const MOCK_DEMO_MD: Record<string, string> = {
  "demo/welcome.md": MOCK_WELCOME_MD,
};

function hasTauri(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

function normalizeMockDocPath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
}

function mockProbeKind(pathRel: string): VaultDocKind {
  const base = pathRel.split("/").pop() ?? pathRel;
  const dot = base.lastIndexOf(".");
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
  if (ext === "md" || ext === "markdown") return "md";
  if (ext === "pdf") return "pdf";
  if (
    ext === "txt" ||
    ext === "text" ||
    ext === "csv" ||
    ext === "json" ||
    ext === "yaml" ||
    ext === "yml" ||
    ext === "toml" ||
    ext === "rs" ||
    ext === "ts" ||
    ext === "tsx" ||
    ext === "js"
  ) {
    return "text";
  }
  return "unsupported";
}

function mockResolveVaultDoc(path: string): ResolveVaultDocResult {
  const pathRel = normalizeMockDocPath(path);
  if (!pathRel) {
    return { ok: false, error: "path is empty" };
  }
  // Fixture map + any demo/*.md for npm run dev split pane.
  const mapped = MOCK_DEMO_MD[pathRel];
  const isDemoMd =
    mapped != null ||
    (pathRel.startsWith("demo/") && pathRel.toLowerCase().endsWith(".md"));
  if (!isDemoMd) {
    // Browser has no bound vault — match Host unbound error style.
    return { ok: false, error: "universe_closed" };
  }
  const text = mapped ?? MOCK_WELCOME_MD;
  const kind = mockProbeKind(pathRel);
  const displayName = pathRel.split("/").pop() ?? pathRel;
  const size = new TextEncoder().encode(text).length;
  return {
    ok: true,
    pathRel,
    pathAbs: `/mock-vault/${pathRel}`,
    kind,
    displayName,
    size,
  };
}

function mockReadVaultText(pathRelIn: string): ReadVaultTextResult {
  const pathRel = normalizeMockDocPath(pathRelIn);
  const mapped = MOCK_DEMO_MD[pathRel];
  const isDemoMd =
    mapped != null ||
    (pathRel.startsWith("demo/") && pathRel.toLowerCase().endsWith(".md"));
  if (!isDemoMd) {
    return { ok: false, error: "universe_closed" };
  }
  return { ok: true, text: mapped ?? MOCK_WELCOME_MD };
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

/**
 * Detect known runtimes (PATH / overrides). Always includes mock.
 * Browser: mock-only. Not for bootstrap — call from settings / user action.
 */
export async function listRuntimes(): Promise<RuntimeInfo[]> {
  if (!hasTauri()) {
    return [{ ...MOCK_RUNTIME_INFO }];
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<RuntimeInfo[]>("list_runtimes");
}

/**
 * Runtime prefs — never universe.db.
 * Tauri: `{app_config_dir}/soit-runtime.json`. Browser: localStorage only.
 */
export async function getRuntimePrefs(): Promise<RuntimePreferences> {
  if (!hasTauri()) {
    return readRuntimePrefsFromLocalStorage();
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = await invoke<Partial<RuntimePreferences>>("get_runtime_prefs");
    return normalizeRuntimePrefs(raw);
  } catch {
    return readRuntimePrefsFromLocalStorage();
  }
}

export async function setRuntimePrefs(
  prefs: RuntimePreferences,
): Promise<RuntimePreferences> {
  const normalized = normalizeRuntimePrefs(prefs);
  writeRuntimePrefsToLocalStorage(normalized);
  if (!hasTauri()) return normalized;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const saved = await invoke<Partial<RuntimePreferences>>("set_runtime_prefs", {
      prefs: normalized,
    });
    const out = normalizeRuntimePrefs(saved);
    writeRuntimePrefsToLocalStorage(out);
    return out;
  } catch {
    return normalized;
  }
}

/**
 * Start external runtime handoff. P0: mock path returns terminal result.
 * Browser: delayed mock text with [[函子]]; cancel via cancelRuntimeHandoff.
 */
export async function startRuntimeHandoff(
  args: StartRuntimeHandoffArgs,
): Promise<HandoffResult> {
  if (!hasTauri()) {
    return browserMockHandoff(args);
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<HandoffResult>("start_runtime_handoff", {
    args: {
      cardId: args.cardId,
      runtimeId: args.runtimeId,
      briefMarkdown: args.briefMarkdown ?? null,
    },
  });
}

export async function cancelRuntimeHandoff(): Promise<CancelHandoffResult> {
  if (!hasTauri()) {
    browserHandoffCancel = true;
    return { ok: true };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<CancelHandoffResult>("cancel_runtime_handoff");
}

/**
 * Resolve a vault-local document path (md/text/pdf/unsupported).
 * Requires open universe on Host; browser mock serves demo/*.md fixtures.
 */
export async function resolveVaultDoc(
  path: string,
): Promise<ResolveVaultDocResult> {
  if (!hasTauri()) {
    return mockResolveVaultDoc(path);
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ResolveVaultDocResult>("resolve_vault_doc", { path });
}

/**
 * Read UTF-8 text under vault path sandbox. No truncation on oversize — error.
 * Browser mock: demo/welcome.md and demo/*.md fixtures only.
 */
export async function readVaultText(
  pathRel: string,
  maxBytes?: number,
): Promise<ReadVaultTextResult> {
  if (!hasTauri()) {
    return mockReadVaultText(pathRel);
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ReadVaultTextResult>("read_vault_text", {
    pathRel,
    maxBytes: maxBytes ?? null,
  });
}

async function browserMockHandoff(
  args: StartRuntimeHandoffArgs,
): Promise<HandoffResult> {
  const runtimeId = (args.runtimeId ?? "").trim();
  if (!runtimeId) {
    throw new Error("runtime_id is required");
  }
  if (runtimeId !== "mock") {
    throw new Error("spawn disabled");
  }
  if (browserHandoffActive) {
    throw new Error("runtime handoff already in progress");
  }

  const runId = `run_browser_${Date.now()}`;
  browserHandoffActive = true;
  browserHandoffCancel = false;

  try {
    // ~800ms cancellable wait (chunked), mirrors Host mock.
    const chunks = 16;
    const stepMs = 50;
    for (let i = 0; i < chunks; i++) {
      if (browserHandoffCancel) {
        return {
          runId,
          status: "cancelled",
          error: "cancelled",
        };
      }
      await new Promise<void>((r) => setTimeout(r, stepMs));
    }
    if (browserHandoffCancel) {
      return {
        runId,
        status: "cancelled",
        error: "cancelled",
      };
    }
    return {
      runId,
      status: "succeeded",
      text: MOCK_HANDOFF_TEXT,
    };
  } finally {
    browserHandoffActive = false;
  }
}
