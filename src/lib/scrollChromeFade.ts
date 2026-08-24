/**
 * Map scrollTop → header chrome fade 0..1 (Explore-like).
 * Header is an absolute overlay; body keeps --ic-head-pad so content scrolls
 * into the top band as chrome fades (not a permanent empty flex slot).
 */

export const SCROLL_FADE_RANGE_PX = 72;

/** 0 = fully visible, 1 = fully faded. */
export function scrollChromeFade(
  scrollTop: number,
  rangePx = SCROLL_FADE_RANGE_PX,
): number {
  if (rangePx <= 0) return 0;
  const t = scrollTop / rangePx;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // ease-out so early scroll starts fading gently
  return 1 - (1 - t) * (1 - t);
}

export function chromeFadeStyle(fade: number): {
  opacity: number;
  transform: string;
  visibility: "visible" | "hidden";
  pointerEvents: "auto" | "none";
} {
  const f = Math.max(0, Math.min(1, fade));
  return {
    opacity: 1 - f,
    transform: `translateY(${(-8 * f).toFixed(2)}px)`,
    visibility: f > 0.92 ? "hidden" : "visible",
    pointerEvents: f > 0.92 ? "none" : "auto",
  };
}
