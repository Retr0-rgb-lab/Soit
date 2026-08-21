/** Tools prefs + invoke DTOs (mirrors Host soit-tools.json). */

export type WebSearchBackend = "off" | "ddg" | "tavily";

export interface ToolsPrefs {
  version: 1;
  toolsEnabled: boolean;
  maxToolRounds: number;
  webSearchBackend: WebSearchBackend;
  tavilyApiKey: string;
  allowLoopbackFetch: boolean;
}

export interface ToolInvokeResult {
  ok: boolean;
  title: string;
  summary: string;
  content: string;
  error?: string;
}

export const TOOLS_PREFS_LS_KEY = "soit-tools-prefs";

export function defaultToolsPrefs(): ToolsPrefs {
  return {
    version: 1,
    toolsEnabled: true,
    maxToolRounds: 3,
    webSearchBackend: "off",
    tavilyApiKey: "",
    allowLoopbackFetch: false,
  };
}

export function normalizeToolsPrefs(raw: unknown): ToolsPrefs {
  const d = defaultToolsPrefs();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  const backend = o.webSearchBackend;
  const webSearchBackend: WebSearchBackend =
    backend === "ddg" || backend === "tavily" || backend === "off"
      ? backend
      : "off";
  let maxToolRounds =
    typeof o.maxToolRounds === "number" && Number.isFinite(o.maxToolRounds)
      ? Math.floor(o.maxToolRounds)
      : d.maxToolRounds;
  if (maxToolRounds < 1) maxToolRounds = 1;
  if (maxToolRounds > 5) maxToolRounds = 5;
  return {
    version: 1,
    toolsEnabled: o.toolsEnabled !== false,
    maxToolRounds,
    webSearchBackend,
    tavilyApiKey:
      typeof o.tavilyApiKey === "string" ? o.tavilyApiKey : d.tavilyApiKey,
    allowLoopbackFetch: o.allowLoopbackFetch === true,
  };
}
