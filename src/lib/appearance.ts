/**
 * Appearance prefs (theme / font / fontSize).
 * localStorage key `soit-appearance`; Settings and FOUC boot share the same enums.
 * Never store in universe.db.
 */

export type AppearanceTheme =
  | "paper"
  | "matcha"
  | "celadon"
  | "ink"
  | "cinnabar";

export type AppearanceFont = "system" | "song" | "hei" | "kai" | "mono";

export type AppearanceFontSize = "sm" | "md" | "lg" | "xl";

export interface AppearancePrefs {
  theme: AppearanceTheme;
  font: AppearanceFont;
  fontSize: AppearanceFontSize;
}

export const APPEARANCE_LS_KEY = "soit-appearance";

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  theme: "paper",
  font: "system",
  fontSize: "md",
};

const THEMES = new Set<string>([
  "paper",
  "matcha",
  "celadon",
  "ink",
  "cinnabar",
]);

const FONTS = new Set<string>(["system", "song", "hei", "kai", "mono"]);

const FONT_SIZES = new Set<string>(["sm", "md", "lg", "xl"]);

/** Critical FOUC bg — keep in sync with index.html boot + tokens --bg-app. */
export const THEME_CRITICAL_BG: Record<AppearanceTheme, string> = {
  paper: "#f3ebe0",
  matcha: "#e8efe3",
  celadon: "#e6eeec",
  ink: "#1c1916",
  cinnabar: "#f3e8e2",
};

function pickEnum<T extends string>(
  value: unknown,
  allowed: Set<string>,
  fallback: T,
): T {
  return typeof value === "string" && allowed.has(value)
    ? (value as T)
    : fallback;
}

/** Validate unknown JSON; illegal fields fall back per-key to defaults. */
export function parseAppearance(raw: unknown): AppearancePrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_APPEARANCE };
  }
  const o = raw as Record<string, unknown>;
  return {
    theme: pickEnum<AppearanceTheme>(
      o.theme,
      THEMES,
      DEFAULT_APPEARANCE.theme,
    ),
    font: pickEnum<AppearanceFont>(o.font, FONTS, DEFAULT_APPEARANCE.font),
    fontSize: pickEnum<AppearanceFontSize>(
      o.fontSize,
      FONT_SIZES,
      DEFAULT_APPEARANCE.fontSize,
    ),
  };
}

export function readAppearance(): AppearancePrefs {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_APPEARANCE };
  }
  try {
    const raw = localStorage.getItem(APPEARANCE_LS_KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    return parseAppearance(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function writeAppearance(prefs: AppearancePrefs): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    APPEARANCE_LS_KEY,
    JSON.stringify(parseAppearance(prefs)),
  );
}

/** Write html data-* (+ critical bg) — same validation as boot. */
export function applyAppearanceToDocument(
  prefs: AppearancePrefs,
  doc: Document = document,
): void {
  const a = parseAppearance(prefs);
  const root = doc.documentElement;
  root.dataset.theme = a.theme;
  root.dataset.font = a.font;
  root.dataset.fontSize = a.fontSize;
  root.style.backgroundColor = THEME_CRITICAL_BG[a.theme];
}
