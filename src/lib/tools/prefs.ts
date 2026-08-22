import {
  defaultToolsPrefs,
  normalizeToolsPrefs,
  TOOLS_PREFS_LS_KEY,
  type ToolsPrefs,
} from "./types";

export {
  defaultToolsPrefs,
  effectiveWebSearchBackend,
  normalizeToolsPrefs,
  TOOLS_PREFS_LS_KEY,
  type ToolsPrefs,
  type ToolInvokeResult,
  type WebSearchBackend,
} from "./types";

export function readToolsPrefsFromLocalStorage(): ToolsPrefs {
  try {
    const raw = localStorage.getItem(TOOLS_PREFS_LS_KEY);
    if (!raw) return defaultToolsPrefs();
    return normalizeToolsPrefs(JSON.parse(raw));
  } catch {
    return defaultToolsPrefs();
  }
}

export function writeToolsPrefsToLocalStorage(prefs: ToolsPrefs): void {
  try {
    localStorage.setItem(
      TOOLS_PREFS_LS_KEY,
      JSON.stringify(normalizeToolsPrefs(prefs)),
    );
  } catch {
    /* ignore */
  }
}

export async function getToolsPrefs(): Promise<ToolsPrefs> {
  try {
    const { getToolsPrefs: hostGet } = await import("../host");
    return normalizeToolsPrefs(await hostGet());
  } catch {
    return readToolsPrefsFromLocalStorage();
  }
}

export async function setToolsPrefs(prefs: ToolsPrefs): Promise<ToolsPrefs> {
  const next = normalizeToolsPrefs(prefs);
  try {
    const { setToolsPrefs: hostSet } = await import("../host");
    const saved = normalizeToolsPrefs(await hostSet(next));
    writeToolsPrefsToLocalStorage(saved);
    return saved;
  } catch {
    writeToolsPrefsToLocalStorage(next);
    return next;
  }
}
