/**
 * Chat / BYOK config.
 *
 * v1: browser + non-Tauri → localStorage key `soit-chat-config`.
 * Tauri path (when host commands exist): `{app_config_dir}/soit-chat.json`.
 * Never store apiKey in universe.db; never commit secrets.
 */

export interface ChatConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export const CHAT_CONFIG_LS_KEY = "soit-chat-config";

export const DEFAULT_CHAT_CONFIG: ChatConfig = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  apiKey: "",
};

export function normalizeChatConfig(
  raw: Partial<ChatConfig> | null | undefined,
): ChatConfig {
  return {
    baseUrl: (raw?.baseUrl ?? DEFAULT_CHAT_CONFIG.baseUrl).trim(),
    model: (raw?.model ?? DEFAULT_CHAT_CONFIG.model).trim(),
    apiKey: (raw?.apiKey ?? "").trim(),
  };
}

export function hasApiKey(cfg: ChatConfig): boolean {
  return Boolean(cfg.apiKey.trim());
}

export function readChatConfigFromLocalStorage(): ChatConfig {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_CHAT_CONFIG };
  }
  try {
    const raw = localStorage.getItem(CHAT_CONFIG_LS_KEY);
    if (!raw) return { ...DEFAULT_CHAT_CONFIG };
    return normalizeChatConfig(JSON.parse(raw) as Partial<ChatConfig>);
  } catch {
    return { ...DEFAULT_CHAT_CONFIG };
  }
}

export function writeChatConfigToLocalStorage(cfg: ChatConfig): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    CHAT_CONFIG_LS_KEY,
    JSON.stringify(normalizeChatConfig(cfg)),
  );
}
