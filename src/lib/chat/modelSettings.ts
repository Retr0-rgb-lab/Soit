/**
 * Multi-provider ModelSettings (version 1).
 * Authoritative BYOK store; ChatConfig is a projection of the active model.
 * Never store in universe.db; never commit secrets.
 */

import {
  DEFAULT_CHAT_CONFIG,
  hasApiKey,
  normalizeChatConfig,
  type ChatConfig,
  writeChatConfigToLocalStorage,
} from "./config";

export const MODEL_SETTINGS_LS_KEY = "soit-model-settings";
export const MODEL_SETTINGS_VERSION = 1 as const;

/** Supplier = credentials + OpenAI-compatible endpoint. */
export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  createdAt: number;
  updatedAt: number;
}

/** Model catalog entry under a provider. */
export interface ModelEntry {
  id: string;
  providerId: string;
  modelId: string;
  label?: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Authoritative multi-provider settings. */
export interface ModelSettings {
  version: typeof MODEL_SETTINGS_VERSION;
  providers: Provider[];
  models: ModelEntry[];
  /** Conversation model; null = Mock. */
  activeModelId: string | null;
  /** Short-explain slot; null = follow activeModelId. */
  explainModelId: string | null;
}

export function emptyModelSettings(): ModelSettings {
  return {
    version: MODEL_SETTINGS_VERSION,
    providers: [],
    models: [],
    activeModelId: null,
    explainModelId: null,
  };
}

function nowMs(): number {
  return Date.now();
}

/** Stable-ish id for browser/tests (not crypto-secure). */
export function newEntityId(prefix: "p" | "m"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${rand}`;
}

/** Infer a short provider display name from baseUrl host. */
export function providerNameFromBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return "默认供应商";
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./, "");
    if (!host) return "默认供应商";
    // api.openai.com → OpenAI; api.deepseek.com → DeepSeek
    const parts = host.split(".");
    const core =
      parts.length >= 2 && parts[0] === "api" ? parts[1] : parts[0];
    if (!core) return host;
    return core.charAt(0).toUpperCase() + core.slice(1);
  } catch {
    return "默认供应商";
  }
}

/**
 * Migrate flat ChatConfig → ModelSettings.
 * Non-empty apiKey → one provider + one model + active; else empty.
 */
export function migrateChatConfigToSettings(cfg: ChatConfig): ModelSettings {
  const c = normalizeChatConfig(cfg);
  if (!c.apiKey.trim()) {
    return emptyModelSettings();
  }
  const t = nowMs();
  const providerId = newEntityId("p");
  const modelEntryId = newEntityId("m");
  const provider: Provider = {
    id: providerId,
    name: providerNameFromBaseUrl(c.baseUrl),
    baseUrl: c.baseUrl || DEFAULT_CHAT_CONFIG.baseUrl,
    apiKey: c.apiKey,
    createdAt: t,
    updatedAt: t,
  };
  const model: ModelEntry = {
    id: modelEntryId,
    providerId,
    modelId: c.model || DEFAULT_CHAT_CONFIG.model,
    enabled: true,
    createdAt: t,
    updatedAt: t,
  };
  return {
    version: MODEL_SETTINGS_VERSION,
    providers: [provider],
    models: [model],
    activeModelId: modelEntryId,
    explainModelId: null,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeProvider(raw: unknown, fallbackNow: number): Provider | null {
  if (!isRecord(raw)) return null;
  const id = String(raw.id ?? "").trim();
  if (!id) return null;
  const name = String(raw.name ?? "").trim() || "未命名供应商";
  let baseUrl = String(raw.baseUrl ?? "").trim();
  if (!baseUrl) baseUrl = DEFAULT_CHAT_CONFIG.baseUrl;
  const apiKey = String(raw.apiKey ?? "").trim();
  const createdAt =
    typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
      ? raw.createdAt
      : fallbackNow;
  const updatedAt =
    typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
      ? raw.updatedAt
      : createdAt;
  return { id, name, baseUrl, apiKey, createdAt, updatedAt };
}

function normalizeModelEntry(
  raw: unknown,
  fallbackNow: number,
): ModelEntry | null {
  if (!isRecord(raw)) return null;
  const id = String(raw.id ?? "").trim();
  const providerId = String(raw.providerId ?? "").trim();
  const modelId = String(raw.modelId ?? "").trim();
  if (!id || !providerId || !modelId) return null;
  const labelRaw = raw.label;
  const label =
    typeof labelRaw === "string" && labelRaw.trim()
      ? labelRaw.trim()
      : undefined;
  const enabled = raw.enabled !== false;
  const createdAt =
    typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
      ? raw.createdAt
      : fallbackNow;
  const updatedAt =
    typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
      ? raw.updatedAt
      : createdAt;
  return { id, providerId, modelId, label, enabled, createdAt, updatedAt };
}

/**
 * Normalize unknown JSON into ModelSettings.
 * Accepts version:1 shape, or flat ChatConfig (migrate), or empty.
 */
export function normalizeModelSettings(raw: unknown): ModelSettings {
  if (raw == null) return emptyModelSettings();

  // Already versioned settings
  if (isRecord(raw) && (raw.version === 1 || raw.version === "1")) {
    const t = nowMs();
    const providersRaw = Array.isArray(raw.providers) ? raw.providers : [];
    const modelsRaw = Array.isArray(raw.models) ? raw.models : [];
    const providers = providersRaw
      .map((p) => normalizeProvider(p, t))
      .filter((p): p is Provider => p != null);
    const providerIds = new Set(providers.map((p) => p.id));
    const models = modelsRaw
      .map((m) => normalizeModelEntry(m, t))
      .filter((m): m is ModelEntry => m != null && providerIds.has(m.providerId));

    let activeModelId: string | null = null;
    const activeRaw = raw.activeModelId;
    if (typeof activeRaw === "string" && activeRaw.trim()) {
      const aid = activeRaw.trim();
      const entry = models.find((m) => m.id === aid);
      if (entry && entry.enabled) {
        activeModelId = aid;
      }
    }

    let explainModelId: string | null = null;
    const explainRaw = raw.explainModelId;
    if (typeof explainRaw === "string" && explainRaw.trim()) {
      const eid = explainRaw.trim();
      const entry = models.find((m) => m.id === eid);
      if (entry && entry.enabled) {
        explainModelId = eid;
      }
    }

    return {
      version: MODEL_SETTINGS_VERSION,
      providers,
      models,
      activeModelId,
      explainModelId,
    };
  }

  // Flat ChatConfig shape
  if (
    isRecord(raw) &&
    ("baseUrl" in raw || "apiKey" in raw || "model" in raw) &&
    !("providers" in raw)
  ) {
    return migrateChatConfigToSettings(
      normalizeChatConfig(raw as Partial<ChatConfig>),
    );
  }

  return emptyModelSettings();
}

/**
 * Project ModelSettings → runtime ChatConfig for ChatPort.
 * No active / missing provider / empty key → empty apiKey (Mock path).
 */
export function resolveChatConfig(settings: ModelSettings): ChatConfig {
  const s = normalizeModelSettings(settings);
  if (!s.activeModelId) {
    return { ...DEFAULT_CHAT_CONFIG, apiKey: "" };
  }
  const entry = s.models.find((m) => m.id === s.activeModelId);
  if (!entry || !entry.enabled) {
    return { ...DEFAULT_CHAT_CONFIG, apiKey: "" };
  }
  const provider = s.providers.find((p) => p.id === entry.providerId);
  if (!provider) {
    return { ...DEFAULT_CHAT_CONFIG, apiKey: "" };
  }
  return normalizeChatConfig({
    baseUrl: provider.baseUrl,
    model: entry.modelId,
    apiKey: provider.apiKey,
  });
}

/** Display label for active model (chip / lists). */
export function activeModelLabel(settings: ModelSettings): string | null {
  const s = normalizeModelSettings(settings);
  if (!s.activeModelId) return null;
  const entry = s.models.find((m) => m.id === s.activeModelId);
  if (!entry) return null;
  return (entry.label && entry.label.trim()) || entry.modelId;
}

/**
 * Project ModelSettings → ChatConfig for short-explain.
 * Missing / disabled / empty-key slot follows the conversation model.
 * Empty key does not independently Mock (unlike resolveChatConfig).
 */
export function resolveExplainConfig(settings: ModelSettings): ChatConfig {
  const s = normalizeModelSettings(settings);
  if (!s.explainModelId) return resolveChatConfig(s);
  const entry = s.models.find((m) => m.id === s.explainModelId);
  if (!entry || !entry.enabled) return resolveChatConfig(s);
  const provider = s.providers.find((p) => p.id === entry.providerId);
  if (!provider) return resolveChatConfig(s);
  const cfg = normalizeChatConfig({
    baseUrl: provider.baseUrl,
    model: entry.modelId,
    apiKey: provider.apiKey,
  });
  if (!hasApiKey(cfg)) return resolveChatConfig(s);
  return cfg;
}

/** Display label for explain slot; null slot → null (UI: follow chat). */
export function explainModelLabel(settings: ModelSettings): string | null {
  const s = normalizeModelSettings(settings);
  if (!s.explainModelId) return null;
  const entry = s.models.find((m) => m.id === s.explainModelId);
  if (!entry) return null;
  return (entry.label && entry.label.trim()) || entry.modelId;
}

/**
 * Legacy set_chat_config path: upsert a single default provider+model
 * and set it active when key non-empty; clear active when key empty.
 */
export function upsertFromChatConfig(
  settings: ModelSettings,
  cfg: ChatConfig,
): ModelSettings {
  const c = normalizeChatConfig(cfg);
  const s = normalizeModelSettings(settings);
  const t = nowMs();

  if (!c.apiKey.trim()) {
    // Keep catalog; clear active so resolve → Mock
    return { ...s, activeModelId: null };
  }

  if (s.providers.length === 0) {
    return migrateChatConfigToSettings(c);
  }

  // Prefer active model's provider; else first provider
  let provider =
    (s.activeModelId
      ? s.models.find((m) => m.id === s.activeModelId)
      : undefined) &&
    s.providers.find(
      (p) =>
        p.id ===
        s.models.find((m) => m.id === s.activeModelId)?.providerId,
    );
  if (!provider) provider = s.providers[0];

  const providers = s.providers.map((p) =>
    p.id === provider!.id
      ? {
          ...p,
          baseUrl: c.baseUrl || p.baseUrl,
          apiKey: c.apiKey,
          updatedAt: t,
        }
      : p,
  );

  let models = [...s.models];
  let activeId = s.activeModelId;
  const under = models.filter((m) => m.providerId === provider!.id);
  const match =
    under.find((m) => m.modelId === c.model) ??
    (activeId ? under.find((m) => m.id === activeId) : undefined) ??
    under[0];

  if (match) {
    models = models.map((m) =>
      m.id === match.id
        ? { ...m, modelId: c.model || m.modelId, enabled: true, updatedAt: t }
        : m,
    );
    activeId = match.id;
  } else {
    const id = newEntityId("m");
    models.push({
      id,
      providerId: provider!.id,
      modelId: c.model || DEFAULT_CHAT_CONFIG.model,
      enabled: true,
      createdAt: t,
      updatedAt: t,
    });
    activeId = id;
  }

  return normalizeModelSettings({
    version: MODEL_SETTINGS_VERSION,
    providers,
    models,
    activeModelId: activeId,
    explainModelId: s.explainModelId,
  });
}

export function readModelSettingsFromLocalStorage(): ModelSettings {
  if (typeof localStorage === "undefined") {
    return emptyModelSettings();
  }
  try {
    const raw = localStorage.getItem(MODEL_SETTINGS_LS_KEY);
    if (raw) {
      return normalizeModelSettings(JSON.parse(raw) as unknown);
    }
    // Migrate from legacy chat config key
    const legacy = localStorage.getItem("soit-chat-config");
    if (legacy) {
      const migrated = migrateChatConfigToSettings(
        normalizeChatConfig(JSON.parse(legacy) as Partial<ChatConfig>),
      );
      // Persist migrated shape so next read is versioned
      writeModelSettingsToLocalStorage(migrated);
      return migrated;
    }
    return emptyModelSettings();
  } catch {
    return emptyModelSettings();
  }
}

export function writeModelSettingsToLocalStorage(settings: ModelSettings): void {
  if (typeof localStorage === "undefined") return;
  const s = normalizeModelSettings(settings);
  localStorage.setItem(MODEL_SETTINGS_LS_KEY, JSON.stringify(s));
  // Mirror projected ChatConfig for legacy readers
  writeChatConfigToLocalStorage(resolveChatConfig(s));
}
