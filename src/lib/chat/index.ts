import {
  hasApiKey,
  normalizeChatConfig,
  readChatConfigFromLocalStorage,
  type ChatConfig,
} from "./config";
import { createMockChat } from "./mockChat";
import { createOpenAICompatChat } from "./openaiCompat";
import type { ChatPort } from "./port";

export type { ChatConfig } from "./config";
export type {
  ChatCompleteInput,
  ChatCompleteResult,
  ChatExplainInput,
  ChatMark,
  ChatMessage,
  ChatPort,
  ChatRole,
} from "./port";
export {
  applyMarksHtml,
  completeResultToHtml,
  escapeHtml,
  stripHtml,
  wrapMarksOnEscaped,
} from "./port";
export { renderAssistantHtml } from "./assistantHtml";
export {
  CHAT_CONFIG_LS_KEY,
  DEFAULT_CHAT_CONFIG,
  hasApiKey,
  normalizeChatConfig,
  readChatConfigFromLocalStorage,
  writeChatConfigToLocalStorage,
} from "./config";
export type {
  ModelEntry,
  ModelSettings,
  Provider,
} from "./modelSettings";
export {
  MODEL_SETTINGS_LS_KEY,
  MODEL_SETTINGS_VERSION,
  activeModelLabel,
  emptyModelSettings,
  explainModelLabel,
  migrateChatConfigToSettings,
  newEntityId,
  normalizeModelSettings,
  providerNameFromBaseUrl,
  readModelSettingsFromLocalStorage,
  resolveChatConfig,
  resolveExplainConfig,
  upsertFromChatConfig,
  writeModelSettingsToLocalStorage,
} from "./modelSettings";
export { createMockChat, MockChat } from "./mockChat";
export {
  createOpenAICompatChat,
  OpenAICompatChat,
  parseAssistantContent,
} from "./openaiCompat";
export { buildInquirySystemPrompt } from "./systemPrompt";
export {
  KEEP_RECENT_TURNS,
  COMPACT_BODY_MAX_CHARS,
  buildStructuredCompact,
  compactThread,
  formatRecentDialogue,
  splitKeepRecent,
} from "./contextCompact";
export type {
  CompactMeta,
  CompactTurn,
  ThreadCompactResult,
} from "./contextCompact";

export type PortKind = "mock" | "openai";

export function portKindFromConfig(cfg: ChatConfig): PortKind {
  return hasApiKey(cfg) ? "openai" : "mock";
}

/** Build a port from an already-loaded config (no I/O). */
export function portFromConfig(cfg: ChatConfig): ChatPort {
  const c = normalizeChatConfig(cfg);
  if (!hasApiKey(c)) return createMockChat();
  return createOpenAICompatChat(c);
}

/**
 * Resolve ChatPort from config.
 * Prefer host getChatConfig when available; falls back to localStorage.
 */
export async function resolvePort(
  configOverride?: ChatConfig | null,
): Promise<ChatPort> {
  if (configOverride) return portFromConfig(configOverride);
  try {
    const { getChatConfig } = await import("../host");
    const cfg = await getChatConfig();
    return portFromConfig(cfg);
  } catch {
    return portFromConfig(readChatConfigFromLocalStorage());
  }
}

/** Sync resolve for tests / UI labels when host is not needed. */
export function resolvePortSync(cfg?: ChatConfig | null): ChatPort {
  return portFromConfig(cfg ?? readChatConfigFromLocalStorage());
}
