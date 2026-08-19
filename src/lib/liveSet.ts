/** Soft cap for simultaneously "live" inquiry threads. */
export const LIVE_MAX = 5;
export const SESSION_TOUCH_MAX = 40;

/**
 * Insert id at front of live list; if over max, drop oldest (end).
 * Returns { liveIds, droppedId? }.
 */
export function pinLiveId(
  liveIds: string[],
  id: string,
  max = LIVE_MAX,
): { liveIds: string[]; droppedId?: string } {
  const without = liveIds.filter((x) => x !== id);
  const next = [id, ...without];
  if (next.length <= max) return { liveIds: next };
  const droppedId = next[next.length - 1];
  return { liveIds: next.slice(0, max), droppedId };
}

export function unpinLiveId(liveIds: string[], id: string): string[] {
  return liveIds.filter((x) => x !== id);
}

export function touchSession(
  sessionTouchIds: string[],
  id: string,
  max = SESSION_TOUCH_MAX,
): string[] {
  const next = [id, ...sessionTouchIds.filter((x) => x !== id)];
  return next.slice(0, max);
}
