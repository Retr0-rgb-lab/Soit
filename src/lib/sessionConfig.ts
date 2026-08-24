/**
 * Session config (lastVault + recentVaults).
 * Host authority: soit-session.json; browser: localStorage `soit-session`.
 * Never universe.db.
 */

import type { SessionConfig } from "../types";

export const SESSION_CONFIG_LS_KEY = "soit-session";
export const SESSION_CONFIG_VERSION = 1 as const;
export const MAX_RECENT_VAULTS = 8;

export function emptySessionConfig(): SessionConfig {
  return {
    version: SESSION_CONFIG_VERSION,
    lastVault: null,
    recentVaults: [],
  };
}

/** Trim, drop empties, dedupe (first wins), cap at MAX_RECENT_VAULTS. */
export function normalizeRecentVaults(paths: unknown): string[] {
  if (!Array.isArray(paths)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of paths) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_RECENT_VAULTS) break;
  }
  return out;
}

export function normalizeSessionConfig(
  raw: Partial<SessionConfig> | null | undefined,
): SessionConfig {
  const lastRaw = raw?.lastVault;
  let lastVault: string | null = null;
  if (typeof lastRaw === "string") {
    const t = lastRaw.trim();
    lastVault = t || null;
  }
  return {
    version: SESSION_CONFIG_VERSION,
    lastVault,
    recentVaults: normalizeRecentVaults(raw?.recentVaults),
  };
}

/**
 * Migrate disk/LS payload → SessionConfig v1.
 * Missing version / only lastVault → seed recentVaults from lastVault.
 */
export function migrateSessionRaw(raw: unknown): SessionConfig {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return emptySessionConfig();
  }
  const o = raw as Record<string, unknown>;
  const hasVersion = o.version === 1 || o.version === SESSION_CONFIG_VERSION;
  const hasRecentsKey = "recentVaults" in o;

  let lastVault: string | null = null;
  if (typeof o.lastVault === "string") {
    const t = o.lastVault.trim();
    lastVault = t || null;
  } else if (o.lastVault === null || o.lastVault === undefined) {
    lastVault = null;
  }

  let recentVaults: string[];
  if (hasRecentsKey || hasVersion) {
    recentVaults = normalizeRecentVaults(o.recentVaults);
  } else {
    // Legacy `{ lastVault }` only → seed recents from last.
    recentVaults = lastVault ? [lastVault] : [];
  }

  return normalizeSessionConfig({
    version: SESSION_CONFIG_VERSION,
    lastVault,
    recentVaults,
  });
}

/** Newest first; move path to front; dedupe; cap 8. Does not change lastVault. */
export function pushRecentVault(
  cfg: SessionConfig,
  path: string,
): SessionConfig {
  const t = path.trim();
  if (!t) return normalizeSessionConfig(cfg);
  const rest = cfg.recentVaults.filter((p) => p !== t);
  return normalizeSessionConfig({
    ...cfg,
    recentVaults: [t, ...rest],
  });
}

/**
 * Remove path from recents. If path matches lastVault, clear last only
 * (recents already without path).
 */
export function removeRecentVault(
  cfg: SessionConfig,
  path: string,
): SessionConfig {
  const t = path.trim();
  if (!t) return normalizeSessionConfig(cfg);
  const recentVaults = cfg.recentVaults.filter((p) => p !== t);
  const lastVault =
    cfg.lastVault != null && cfg.lastVault.trim() === t ? null : cfg.lastVault;
  return normalizeSessionConfig({
    ...cfg,
    lastVault,
    recentVaults,
  });
}

export function readSessionConfigFromLocalStorage(): SessionConfig {
  if (typeof localStorage === "undefined") {
    return emptySessionConfig();
  }
  try {
    const raw = localStorage.getItem(SESSION_CONFIG_LS_KEY);
    if (!raw) return emptySessionConfig();
    return migrateSessionRaw(JSON.parse(raw) as unknown);
  } catch {
    return emptySessionConfig();
  }
}

export function writeSessionConfigToLocalStorage(cfg: SessionConfig): void {
  if (typeof localStorage === "undefined") return;
  const normalized = normalizeSessionConfig(cfg);
  localStorage.setItem(SESSION_CONFIG_LS_KEY, JSON.stringify(normalized));
}
