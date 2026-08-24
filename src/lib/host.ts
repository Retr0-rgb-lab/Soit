import type {
  AppendResidueResult,
  AppendTurnArgs,
  AppendTurnResult,
  BootstrapState,
  ChatConfig,
  DeleteTurnArgs,
  HostMutationResult,
  ImportVaultMaterialResult,
  ListVaultMaterialsResult,
  MaterialsEntry,
  ModelSettings,
  OpenUniverseResult,
  PrecipitateConceptResult,
  ReadVaultTextResult,
  ResolveVaultDocResult,
  SelectVaultResult,
  SessionConfig,
  SkillInfo,
  SpawnInquiryHostArgs,
  UpdateCardArgs,
  UpdateTurnArgs,
  VaultDocKind,
  WorkspaceSnapshot,
} from "../types";
import { normalizeChatConfig } from "./chat/config";
import {
  normalizeModelSettings,
  readModelSettingsFromLocalStorage,
  resolveChatConfig,
  upsertFromChatConfig,
  writeModelSettingsToLocalStorage,
} from "./chat/modelSettings";
import {
  normalizeSessionConfig,
  pushRecentVault,
  readSessionConfigFromLocalStorage,
  writeSessionConfigToLocalStorage,
} from "./sessionConfig";
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
import { sanitizeMaterialFileName } from "./splitRatio";

/** Browser-only mock handoff cancel flag (at most one in-flight). */
let browserHandoffCancel = false;
let browserHandoffActive = false;

/** Decoded import ceiling — matches Host MAX_IMPORT_BYTES (materials SPE §2.2). */
export const MAX_MATERIAL_IMPORT_BYTES = 2_000_000;

/** Browser mock vault docs (PEL-156) — no Tauri / no real vault. */
const MOCK_WELCOME_MD = `# 欢迎

这是 Soit 陪读演示文档（浏览器 mock）。

你可以在专注模式下并排阅读材料，划词后引用、解释或深挖发散。
`;

/** Mutable fixture map for browser mock import bodies (SPE §2.5). Starts empty. */
const MOCK_DEMO_MD: Record<string, string> = {};

/** In-memory materials list for browser mock — empty until user imports. */
let mockMaterialsEntries: MaterialsEntry[] = [];

/** Test helper — reset mock materials list/bodies between cases. */
export function __resetMockMaterialsForTests(): void {
  for (const key of Object.keys(MOCK_DEMO_MD)) {
    delete MOCK_DEMO_MD[key];
  }
  mockMaterialsEntries = [];
  // Optional fixture some tests still open by path:
  MOCK_DEMO_MD["demo/welcome.md"] = MOCK_WELCOME_MD;
}

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

function mockHasDocBody(pathRel: string): boolean {
  if (MOCK_DEMO_MD[pathRel] != null) return true;
  // Loose demo/*.md fixtures for npm run dev split pane.
  return pathRel.startsWith("demo/") && pathRel.toLowerCase().endsWith(".md");
}

function mockResolveVaultDoc(path: string): ResolveVaultDocResult {
  const pathRel = normalizeMockDocPath(path);
  if (!pathRel) {
    return { ok: false, error: "path is empty" };
  }
  // Only paths with mock body resolve (SPE §2.5 — openDoc needs fixture text).
  if (!mockHasDocBody(pathRel)) {
    // Browser has no bound vault — match Host unbound error style.
    return { ok: false, error: "universe_closed" };
  }
  const text = MOCK_DEMO_MD[pathRel] ?? MOCK_WELCOME_MD;
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
  if (!mockHasDocBody(pathRel)) {
    return { ok: false, error: "universe_closed" };
  }
  return { ok: true, text: MOCK_DEMO_MD[pathRel] ?? MOCK_WELCOME_MD };
}

function mockListVaultMaterials(): ListVaultMaterialsResult {
  return {
    ok: true,
    entries: mockMaterialsEntries.map((e) => ({ ...e })),
    truncated: false,
  };
}

function mockImportVaultMaterial(
  fileName: string,
  bytesBase64: string,
): ImportVaultMaterialResult {
  let raw: Uint8Array;
  try {
    const bin = atob(bytesBase64);
    // Check before allocating the full copy when possible.
    if (bin.length > MAX_MATERIAL_IMPORT_BYTES) {
      return { ok: false, error: "file_too_large" };
    }
    raw = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
  } catch {
    return { ok: false, error: "invalid base64" };
  }
  if (raw.byteLength > MAX_MATERIAL_IMPORT_BYTES) {
    return { ok: false, error: "file_too_large" };
  }
  if (!fileName.trim()) {
    return { ok: false, error: "invalid file name" };
  }
  const name = sanitizeMaterialFileName(fileName);
  // Collision: stem (n).ext under materials/
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let dest = name;
  let n = 2;
  const taken = new Set(mockMaterialsEntries.map((e) => e.pathRel));
  while (taken.has(`materials/${dest}`)) {
    dest = `${stem} (${n})${ext}`;
    n += 1;
  }
  const pathRel = `materials/${dest}`;
  const kind = mockProbeKind(pathRel);
  mockMaterialsEntries = [
    ...mockMaterialsEntries,
    {
      pathRel,
      name: dest,
      kind,
      size: raw.byteLength,
      mtimeMs: Date.now(),
    },
  ];
  // Store body so openDoc can preview md/text imports in browser mock.
  if (kind === "md" || kind === "text") {
    try {
      MOCK_DEMO_MD[pathRel] = new TextDecoder("utf-8", { fatal: false }).decode(
        raw,
      );
    } catch {
      MOCK_DEMO_MD[pathRel] = "";
    }
  }
  return { ok: true, pathRel };
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

/** Full session config (lastVault + recentVaults). Host / browser LS authority. */
export async function getSessionConfig(): Promise<SessionConfig> {
  if (!hasTauri()) {
    return readSessionConfigFromLocalStorage();
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const raw = await invoke<SessionConfig>("get_session_config");
  return normalizeSessionConfig(raw);
}

/** Write full session config (normalized). */
export async function setSessionConfig(config: SessionConfig): Promise<void> {
  const normalized = normalizeSessionConfig(config);
  if (!hasTauri()) {
    writeSessionConfigToLocalStorage(normalized);
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_session_config", { config: normalized });
}

/** App-config last vault path (not universe.db). Bootstrap-safe. */
export async function getLastVault(): Promise<string | null> {
  if (!hasTauri()) {
    return readSessionConfigFromLocalStorage().lastVault;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("get_last_vault");
}

/**
 * Persist or clear last vault in app config.
 * Some(path) → last + push_recent; null → last only (recents unchanged).
 * closeUniverse does not clear lastVault.
 */
export async function setLastVault(path: string | null): Promise<void> {
  if (!hasTauri()) {
    const cur = readSessionConfigFromLocalStorage();
    if (path != null && path.trim()) {
      const t = path.trim();
      writeSessionConfigToLocalStorage(
        pushRecentVault({ ...cur, lastVault: t }, t),
      );
    } else {
      writeSessionConfigToLocalStorage({ ...cur, lastVault: null });
    }
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_last_vault", { path });
}

/**
 * Host snapshot. Unbound → source "demo" with **empty** graph (no product seed).
 * Bound empty universe → source "empty". Bound with cards → "universe".
 */
export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  if (!hasTauri()) {
    const { unboundEmptySnapshot } = await import("./demoSeed");
    return unboundEmptySnapshot();
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
    process: args.process,
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

/** Host `set_turn_starred` (PEL-166). Browser: caller updates memory. */
export async function setTurnStarred(args: {
  cardId: string;
  turnId: string;
  starred: boolean;
}): Promise<HostMutationResult> {
  if (!hasTauri()) {
    throw new Error("set_turn_starred requires tauri");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<HostMutationResult>("set_turn_starred", {
    cardId: args.cardId,
    turnId: args.turnId,
    starred: args.starred,
  });
}

/** Host `delete_inquiry` — card + subtree; turns cascade; edges stripped. */
export async function deleteInquiry(
  cardId: string,
): Promise<HostMutationResult> {
  if (!hasTauri()) {
    throw new Error("delete_inquiry requires tauri");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<HostMutationResult>("delete_inquiry", { cardId });
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
 * Authoritative multi-provider BYOK settings — never universe.db.
 * Tauri: `{app_config_dir}/soit-chat.json` (versioned ModelSettings).
 * Browser: localStorage (`soit-model-settings`, migrates legacy chat config).
 */
export async function getModelSettings(): Promise<ModelSettings> {
  if (!hasTauri()) {
    return readModelSettingsFromLocalStorage();
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = await invoke<unknown>("get_model_settings");
    return normalizeModelSettings(raw);
  } catch {
    return readModelSettingsFromLocalStorage();
  }
}

export async function setModelSettings(settings: ModelSettings): Promise<void> {
  const s = normalizeModelSettings(settings);
  // Mirror LS + projected ChatConfig for browser/dev and legacy readers.
  writeModelSettingsToLocalStorage(s);
  if (!hasTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_model_settings", { settings: s });
  } catch {
    // localStorage already written
  }
}

/**
 * BYOK chat config projection of active model — never universe.db.
 * Tauri: projects from ModelSettings in `soit-chat.json`.
 * Browser: resolve from model settings (legacy chat key migrates on read).
 */
export async function getChatConfig(): Promise<ChatConfig> {
  if (!hasTauri()) {
    return resolveChatConfig(readModelSettingsFromLocalStorage());
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = await invoke<Partial<ChatConfig>>("get_chat_config");
    return normalizeChatConfig(raw);
  } catch {
    return resolveChatConfig(readModelSettingsFromLocalStorage());
  }
}

/** Legacy path: upsert single provider+model (or clear active when key empty). */
export async function setChatConfig(config: ChatConfig): Promise<void> {
  const cfg = normalizeChatConfig(config);
  // Always upsert model settings + mirror projected ChatConfig in LS.
  const next = upsertFromChatConfig(readModelSettingsFromLocalStorage(), cfg);
  writeModelSettingsToLocalStorage(next);
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

export interface GetPdfPreviewUrlResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/**
 * Lazy vault PDF preview URL (PEL-156 P1). Desktop: 127.0.0.1 loopback server.
 * Browser mock: no server — error so UI falls back to PdfGuide.
 */
export async function getPdfPreviewUrl(
  pathRel: string,
): Promise<GetPdfPreviewUrlResult> {
  if (!hasTauri()) {
    return { ok: false, error: "桌面版支持内嵌 PDF 预览" };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<GetPdfPreviewUrlResult>("get_pdf_preview_url", { pathRel });
}

/**
 * Lazy list files under vault `materials/` (materials-rail SPE §2.2).
 * Browser mock: includes `demo/welcome.md` + in-memory imports (SPE §2.5).
 * Not for bootstrap / open_universe.
 */
export async function listVaultMaterials(opts?: {
  maxDepth?: number;
  maxEntries?: number;
}): Promise<ListVaultMaterialsResult> {
  if (!hasTauri()) {
    return mockListVaultMaterials();
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ListVaultMaterialsResult>("list_vault_materials", {
    maxDepth: opts?.maxDepth ?? null,
    maxEntries: opts?.maxEntries ?? null,
  });
}

/**
 * Import one file (base64) into vault `materials/` (≤2MB decoded).
 * Browser mock: appends in-memory entry; does not write disk (SPE §2.5).
 */
export async function importVaultMaterial(args: {
  fileName: string;
  bytesBase64: string;
}): Promise<ImportVaultMaterialResult> {
  if (!hasTauri()) {
    return mockImportVaultMaterial(args.fileName, args.bytesBase64);
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ImportVaultMaterialResult>("import_vault_material", {
    fileName: args.fileName,
    bytesBase64: args.bytesBase64,
  });
}

/** Tools prefs — app config soit-tools.json (not universe.db). */
export async function getToolsPrefs(): Promise<
  import("./tools/types").ToolsPrefs
> {
  const { normalizeToolsPrefs, readToolsPrefsFromLocalStorage } = await import(
    "./tools/prefs"
  );
  if (!hasTauri()) {
    return readToolsPrefsFromLocalStorage();
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const raw = await invoke<unknown>("get_tools_prefs");
  return normalizeToolsPrefs(raw);
}

export async function setToolsPrefs(
  prefs: import("./tools/types").ToolsPrefs,
): Promise<import("./tools/types").ToolsPrefs> {
  const {
    normalizeToolsPrefs,
    writeToolsPrefsToLocalStorage,
  } = await import("./tools/prefs");
  const next = normalizeToolsPrefs(prefs);
  if (!hasTauri()) {
    writeToolsPrefsToLocalStorage(next);
    return next;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const raw = await invoke<unknown>("set_tools_prefs", { prefs: next });
  const saved = normalizeToolsPrefs(raw);
  writeToolsPrefsToLocalStorage(saved);
  return saved;
}

/** Host tool invoke — vault_search / fetch_url / web_search. */
export async function invokeInquiryTool(
  name: string,
  argsJson: string,
): Promise<import("./tools/types").ToolInvokeResult> {
  if (!hasTauri()) {
    return browserMockInvokeTool(name, argsJson);
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<import("./tools/types").ToolInvokeResult>(
    "invoke_inquiry_tool",
    { name, argsJson },
  );
}

async function browserMockInvokeTool(
  name: string,
  argsJson: string,
): Promise<import("./tools/types").ToolInvokeResult> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson || "{}") as Record<string, unknown>;
  } catch {
    /* empty */
  }
  const { effectiveWebSearchBackend, readToolsPrefsFromLocalStorage } =
    await import("./tools/prefs");
  const prefs = readToolsPrefsFromLocalStorage();
  if (!prefs.toolsEnabled) {
    return {
      ok: false,
      title: "工具",
      summary: "工具已关闭",
      content: "工具已关闭（设置 → 工具）",
      error: "工具已关闭（设置 → 工具）",
    };
  }
  if (name === "vault_search") {
    const q = String(args.query ?? "");
    return {
      ok: true,
      title: "检索库内",
      summary: `「${q}」· mock 0 条`,
      content: JSON.stringify({ query: q, count: 0, hits: [] }, null, 2),
    };
  }
  if (name === "fetch_url") {
    const url = String(args.url ?? "");
    try {
      const res = await fetch(url);
      const text = (await res.text()).slice(0, 4000);
      return {
        ok: res.ok,
        title: "读取链接",
        summary: url,
        content: text || `(HTTP ${res.status})`,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        title: "读取链接",
        summary: msg,
        content: msg,
        error: msg,
      };
    }
  }
  if (name === "web_search") {
    const effective = effectiveWebSearchBackend(prefs);
    if (effective === "off") {
      const err = "网页搜索已关闭。点作曲条的搜索按钮开启。";
      return {
        ok: false,
        title: "网页搜索",
        summary: err,
        content: err,
        error: err,
      };
    }
    return {
      ok: true,
      title: "网页搜索",
      summary: `browser mock (${effective}) · 1 条`,
      content: JSON.stringify(
        {
          query: args.query,
          hits: [
            {
              title: "Mock result",
              url: "https://example.com",
              snippet: "Browser mock search hit (desktop Host is authoritative).",
            },
          ],
        },
        null,
        2,
      ),
    };
  }
  const err = `unknown tool: ${name}`;
  return { ok: false, title: "未知工具", summary: err, content: err, error: err };
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
