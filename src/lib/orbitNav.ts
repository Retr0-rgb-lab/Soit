/**
 * Spatial orbit navigation — arrows follow on-screen position, not tree roles.
 *
 * ↑ / wheel-up    → nearest node visually above
 * ↓ / wheel-down  → nearest node visually below
 * ← / wheel-left  → nearest node visually left
 * → / wheel-right → nearest node visually right
 *
 * World y grows downward (same as CSS top); smaller y = higher on screen.
 */

export type OrbitNavKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export type OrbitNavInput =
  | { type: "key"; key: OrbitNavKey }
  | { type: "wheel"; dx: number; dy: number };

/** Minimal position needed for spatial pick */
export type OrbitNavPoint = {
  id: string;
  x: number;
  y: number;
};

const DIR: Record<OrbitNavKey, { x: number; y: number }> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

/** Half-angle cosine gate (~75° cone in the key direction). */
const MIN_COS = 0.25;

/**
 * Pick nearest point lying in the arrow direction from focus.
 * Score = distance / cos²(angle) — prefers close + well-aligned.
 */
export function pickInDirection(
  points: OrbitNavPoint[],
  focusId: string,
  key: OrbitNavKey,
): string {
  const focus = points.find((p) => p.id === focusId);
  if (!focus || points.length < 2) return focusId;

  const dir = DIR[key];
  let bestId = focusId;
  let bestScore = Infinity;

  for (const p of points) {
    if (p.id === focusId) continue;
    const vx = p.x - focus.x;
    const vy = p.y - focus.y;
    const dist = Math.hypot(vx, vy);
    if (dist < 1e-6) continue;
    const cos = (vx * dir.x + vy * dir.y) / dist;
    if (cos < MIN_COS) continue;
    const score = dist / (cos * cos);
    if (score < bestScore) {
      bestScore = score;
      bestId = p.id;
    }
  }
  return bestId;
}

export function inputToKey(input: OrbitNavInput): OrbitNavKey | null {
  if (input.type === "key") return input.key;
  const { dx, dy } = input;
  if (Math.abs(dy) >= Math.abs(dx) && Math.abs(dy) >= 0.5) {
    return dy > 0 ? "ArrowDown" : "ArrowUp";
  }
  if (Math.abs(dx) >= 0.5) {
    return dx > 0 ? "ArrowRight" : "ArrowLeft";
  }
  return null;
}

/**
 * Pure transition using layout positions.
 * @param points stable world coords (e.g. model.world)
 */
export function navigateOrbit(
  points: OrbitNavPoint[],
  focusId: string,
  input: OrbitNavInput,
): string {
  if (!points.length) return focusId;
  if (!points.some((p) => p.id === focusId)) {
    return points[0]!.id;
  }
  const key = inputToKey(input);
  if (!key) return focusId;
  return pickInDirection(points, focusId, key);
}

/** Map KeyboardEvent.key to orbit key. */
export function orbitKeyFromKeyboard(key: string): OrbitNavKey | null {
  switch (key) {
    case "ArrowUp":
    case "ArrowDown":
    case "ArrowLeft":
    case "ArrowRight":
      return key;
    default:
      return null;
  }
}
