/**
 * Runtime prefs localStorage mirror (browser / resolvePort-style sync).
 * Tauri authority: `{app_config_dir}/soit-runtime.json` via host commands.
 * Never store in universe.db.
 */

import {
  DEFAULT_RUNTIME_PREFS,
  type RuntimePreferences,
} from "./types";

export const RUNTIME_PREFS_LS_KEY = "soit-runtime-prefs";

export function normalizeRuntimePrefs(
  raw: Partial<RuntimePreferences> | null | undefined,
): RuntimePreferences {
  const defaultRuntimeId = (
    raw?.defaultRuntimeId ?? DEFAULT_RUNTIME_PREFS.defaultRuntimeId
  ).trim();
  const binOverrides: Record<string, string> = {};
  const src = raw?.binOverrides;
  if (src && typeof src === "object" && !Array.isArray(src)) {
    for (const [k, v] of Object.entries(src)) {
      if (typeof v === "string" && v.trim()) {
        binOverrides[k] = v.trim();
      }
    }
  }
  return {
    defaultRuntimeId: defaultRuntimeId || DEFAULT_RUNTIME_PREFS.defaultRuntimeId,
    binOverrides,
    enableSpawn: Boolean(raw?.enableSpawn),
  };
}

export function readRuntimePrefsFromLocalStorage(): RuntimePreferences {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_RUNTIME_PREFS, binOverrides: {} };
  }
  try {
    const raw = localStorage.getItem(RUNTIME_PREFS_LS_KEY);
    if (!raw) {
      return { ...DEFAULT_RUNTIME_PREFS, binOverrides: {} };
    }
    return normalizeRuntimePrefs(JSON.parse(raw) as Partial<RuntimePreferences>);
  } catch {
    return { ...DEFAULT_RUNTIME_PREFS, binOverrides: {} };
  }
}

export function writeRuntimePrefsToLocalStorage(prefs: RuntimePreferences): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    RUNTIME_PREFS_LS_KEY,
    JSON.stringify(normalizeRuntimePrefs(prefs)),
  );
}
