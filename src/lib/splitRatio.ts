/**
 * Doc/card split fraction law (materials-rail spec §2.6).
 * CSS var `--doc-fraction`; localStorage key `soit-doc-split-ratio`.
 * Never store in universe.db.
 */

export const DOC_FRACTION_MIN = 0.28;
export const DOC_FRACTION_MAX = 0.72;
export const DOC_FRACTION_DEFAULT = 0.42;
/** Visual-only when layout === 'doc-wide'; does not overwrite stored split. */
export const DOC_WIDE_FRACTION = 0.68;

export const DOC_SPLIT_RATIO_LS_KEY = "soit-doc-split-ratio";

/** Clamp to [MIN, MAX]; non-finite → DEFAULT. */
export function clampDocFraction(n: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    return DOC_FRACTION_DEFAULT;
  }
  if (n < DOC_FRACTION_MIN) return DOC_FRACTION_MIN;
  if (n > DOC_FRACTION_MAX) return DOC_FRACTION_MAX;
  return n;
}

/** Read persisted split fraction; missing/illegal → DEFAULT (clamped). */
export function readStoredDocFraction(): number {
  if (typeof localStorage === "undefined") {
    return DOC_FRACTION_DEFAULT;
  }
  try {
    const raw = localStorage.getItem(DOC_SPLIT_RATIO_LS_KEY);
    if (raw == null || raw === "") return DOC_FRACTION_DEFAULT;
    return clampDocFraction(Number(raw));
  } catch {
    return DOC_FRACTION_DEFAULT;
  }
}

/** Persist clamped fraction as a plain number string. */
export function writeStoredDocFraction(n: number): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    DOC_SPLIT_RATIO_LS_KEY,
    String(clampDocFraction(n)),
  );
}

/**
 * FE-side material import name: single path segment, no `/` `\` `..`.
 * Collision suffix `stem (n).ext` is host-side; this only cleans the leaf name.
 */
export function sanitizeMaterialFileName(name: string): string {
  const raw = typeof name === "string" ? name : "";
  // Take last segment only (drop any path).
  let base = raw.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "";
  base = base.trim();
  // Strip leftover traversal / separators and Windows-illegal chars.
  base = base
    .replace(/\.\./g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/^\.+/, "")
    .trim();
  if (!base || base === "." || base === "..") {
    return "untitled";
  }
  // Cap length to keep vault paths sane (preserve extension when possible).
  const maxLen = 180;
  if (base.length > maxLen) {
    const dot = base.lastIndexOf(".");
    if (dot > 0 && base.length - dot <= 12) {
      const ext = base.slice(dot);
      const stem = base.slice(0, maxLen - ext.length);
      base = (stem || "untitled") + ext;
    } else {
      base = base.slice(0, maxLen);
    }
  }
  return base;
}
