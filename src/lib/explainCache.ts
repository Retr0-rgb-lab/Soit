/**
 * Per-card short-explain cache (PEL-163).
 * Same card + same span → reuse text; never cross cards; not persisted to db.
 */

const MAX_ENTRIES_PER_CARD = 48;

/** cardId → (cacheKey → body) */
const byCard = new Map<string, Map<string, string>>();

/** Normalize span for cache key (trim + collapse internal whitespace lightly). */
export function explainCacheKey(span: string): string {
  return (span ?? "").replace(/\s+/g, " ").trim();
}

export function getExplainCached(
  cardId: string,
  span: string,
): string | null {
  const cid = (cardId ?? "").trim();
  const key = explainCacheKey(span);
  if (!cid || !key) return null;
  const hit = byCard.get(cid)?.get(key);
  return hit != null && hit.trim() ? hit : null;
}

export function setExplainCached(
  cardId: string,
  span: string,
  body: string,
): void {
  const cid = (cardId ?? "").trim();
  const key = explainCacheKey(span);
  const text = (body ?? "").trim();
  if (!cid || !key || !text) return;
  let map = byCard.get(cid);
  if (!map) {
    map = new Map();
    byCard.set(cid, map);
  }
  // Refresh insertion order (Map keeps insertion order).
  if (map.has(key)) map.delete(key);
  map.set(key, text);
  while (map.size > MAX_ENTRIES_PER_CARD) {
    const first = map.keys().next().value as string | undefined;
    if (first == null) break;
    map.delete(first);
  }
}

/** Drop one card's cache (focus leave optional). */
export function clearExplainCacheForCard(cardId: string): void {
  byCard.delete((cardId ?? "").trim());
}

/** Test helper. */
export function __resetExplainCacheForTests(): void {
  byCard.clear();
}
