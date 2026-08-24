import type { InquiryNode } from "../types";
import type { FocusNavKind } from "./focusMotion";

export type CardDragDir = "up" | "down" | "left" | "right";

export type CardDragNavResult = {
  targetId: string;
  kind: FocusNavKind;
  dir: CardDragDir;
};

/** Dominant axis after drag exceeds threshold (px). */
export function dominantDragDir(
  dx: number,
  dy: number,
  threshold = 56,
): CardDragDir | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < threshold && ay < threshold) return null;
  if (ay >= ax) return dy < 0 ? "up" : "down";
  return dx < 0 ? "left" : "right";
}

function kidsOf(nodes: InquiryNode[], parentId: string): InquiryNode[] {
  return nodes.filter((n) => n.parentId === parentId);
}

/**
 * Preferred "forward" neighbor when holding with little movement:
 * deepen child → diverge child → first diverge sibling (at deepen leaf).
 */
export function resolveForwardNav(
  focusId: string,
  nodes: InquiryNode[],
): CardDragNavResult | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const focus = byId.get(focusId);
  if (!focus) return null;

  const kids = kidsOf(nodes, focusId);
  if (kids.length) {
    const deepen = kids.find((k) => k.kind === "deepen");
    const diverge = kids.find((k) => k.kind === "diverge");
    const target = deepen ?? diverge ?? kids[0]!;
    return {
      targetId: target.id,
      kind: target.kind === "diverge" ? "diverge" : "deepen",
      dir: "down",
    };
  }

  // At bottom of deepen chain: surface a diverge sibling if any.
  if (focus.parentId) {
    const sibs = kidsOf(nodes, focus.parentId);
    const divergeSibs = sibs.filter(
      (n) => n.kind === "diverge" && n.id !== focusId,
    );
    if (divergeSibs.length) {
      const i = sibs.findIndex((n) => n.id === focusId);
      const after = sibs.slice(i + 1).find((n) => n.kind === "diverge");
      const target = after ?? divergeSibs[0]!;
      return { targetId: target.id, kind: "diverge", dir: "down" };
    }
  }

  return null;
}

/**
 * Map drag direction → related card.
 * up = parent · down = deepen child → diverge child → diverge sibling · L/R = siblings
 */
export function resolveCardDragNav(
  focusId: string,
  nodes: InquiryNode[],
  dx: number,
  dy: number,
  threshold = 56,
): CardDragNavResult | null {
  const dir = dominantDragDir(dx, dy, threshold);
  if (!dir) return null;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const focus = byId.get(focusId);
  if (!focus) return null;

  if (dir === "up") {
    if (!focus.parentId || !byId.has(focus.parentId)) return null;
    return { targetId: focus.parentId, kind: "back", dir };
  }

  if (dir === "down") {
    const kids = kidsOf(nodes, focusId);
    if (kids.length) {
      const deepen = kids.find((k) => k.kind === "deepen");
      const diverge = kids.find((k) => k.kind === "diverge");
      const target = deepen ?? diverge ?? kids[0]!;
      return {
        targetId: target.id,
        kind: target.kind === "diverge" ? "diverge" : "deepen",
        dir,
      };
    }
    // Leaf: prefer diverge sibling ("到底了就是发散")
    return resolveForwardNav(focusId, nodes);
  }

  // left / right — siblings under same parent
  if (!focus.parentId) return null;
  const sibs = kidsOf(nodes, focus.parentId);
  if (sibs.length < 2) return null;
  const i = sibs.findIndex((n) => n.id === focusId);
  if (i < 0) return null;
  const next =
    dir === "right"
      ? sibs[(i + 1) % sibs.length]!
      : sibs[(i - 1 + sibs.length) % sibs.length]!;
  if (next.id === focusId) return null;
  const kind: FocusNavKind =
    next.kind === "deepen"
      ? "deepen"
      : next.kind === "diverge"
        ? "diverge"
        : "jump";
  return { targetId: next.id, kind, dir };
}

/** Snippet for mini-peek: last non-empty assistant plain text, truncated. */
export function cardPeekSnippet(
  turns: Array<{ aiHtml?: string; user?: string }>,
  maxLen = 120,
): string {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!;
    const raw = (t.aiHtml || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (raw) {
      return raw.length > maxLen ? `${raw.slice(0, maxLen)}…` : raw;
    }
    const u = (t.user || "").trim();
    if (u) {
      return u.length > maxLen ? `${u.slice(0, maxLen)}…` : u;
    }
  }
  return "（尚无内容）";
}
