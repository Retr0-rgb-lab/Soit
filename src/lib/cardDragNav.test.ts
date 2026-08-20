import { describe, expect, it } from "vitest";
import {
  cardPeekSnippet,
  dominantDragDir,
  resolveCardDragNav,
  resolveForwardNav,
} from "./cardDragNav";
import type { InquiryNode } from "../types";

const nodes: InquiryNode[] = [
  { id: "c1", title: "根", parentId: null, kind: "root", unread: false },
  { id: "c2", title: "深", parentId: "c1", kind: "deepen", unread: false },
  { id: "c3", title: "更深", parentId: "c2", kind: "deepen", unread: false },
  { id: "c4", title: "散A", parentId: "c2", kind: "diverge", unread: false },
  { id: "c5", title: "散B", parentId: "c2", kind: "diverge", unread: false },
];

describe("dominantDragDir", () => {
  it("needs threshold", () => {
    expect(dominantDragDir(10, 10, 56)).toBeNull();
  });
  it("picks axis by larger component", () => {
    expect(dominantDragDir(0, -80)).toBe("up");
    expect(dominantDragDir(0, 80)).toBe("down");
    expect(dominantDragDir(-80, 10)).toBe("left");
    expect(dominantDragDir(80, 10)).toBe("right");
  });
});

describe("resolveCardDragNav", () => {
  it("up → parent", () => {
    expect(resolveCardDragNav("c3", nodes, 0, -80)?.targetId).toBe("c2");
    expect(resolveCardDragNav("c3", nodes, 0, -80)?.kind).toBe("back");
  });

  it("down → deepen child preferred", () => {
    const r = resolveCardDragNav("c2", nodes, 0, 80);
    expect(r?.targetId).toBe("c3");
    expect(r?.kind).toBe("deepen");
  });

  it("leaf down → diverge sibling (到底了就是发散)", () => {
    const r = resolveCardDragNav("c3", nodes, 0, 80);
    expect(r?.targetId).toBe("c4");
    expect(r?.kind).toBe("diverge");
  });

  it("left/right cycle siblings", () => {
    const right = resolveCardDragNav("c3", nodes, 80, 0);
    // sibs of c2: c3,c4,c5 — right from c3 → c4
    expect(right?.targetId).toBe("c4");
    expect(right?.kind).toBe("diverge");
    const left = resolveCardDragNav("c3", nodes, -80, 0);
    expect(left?.targetId).toBe("c5");
  });

  it("root has no up/left/right", () => {
    expect(resolveCardDragNav("c1", nodes, 0, -80)).toBeNull();
    expect(resolveCardDragNav("c1", nodes, 80, 0)).toBeNull();
  });
});

describe("resolveForwardNav", () => {
  it("prefers deepen child", () => {
    expect(resolveForwardNav("c2", nodes)?.targetId).toBe("c3");
  });
  it("at deepen leaf uses diverge sibling", () => {
    expect(resolveForwardNav("c3", nodes)?.targetId).toBe("c4");
  });
});

describe("cardPeekSnippet", () => {
  it("strips html and truncates", () => {
    const s = cardPeekSnippet(
      [{ aiHtml: "<p>hello <b>world</b> extra text here for length</p>" }],
      12,
    );
    expect(s.endsWith("…")).toBe(true);
    expect(s.includes("<")).toBe(false);
  });
});
