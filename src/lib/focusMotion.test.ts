import { describe, expect, it } from "vitest";
import { inferFocusNavKind } from "./focusMotion";
import type { Edge, InquiryNode } from "../types";

const nodes: InquiryNode[] = [
  { id: "c1", title: "根", parentId: null, kind: "root", unread: false },
  { id: "c2", title: "深", parentId: "c1", kind: "deepen", unread: false },
  { id: "c3", title: "更深", parentId: "c2", kind: "deepen", unread: false },
  { id: "c4", title: "散A", parentId: "c2", kind: "diverge", unread: false },
  { id: "c5", title: "散B", parentId: "c2", kind: "diverge", unread: false },
];

const edges: Edge[] = [
  {
    id: "e1",
    kind: "deepen",
    fromCardId: "c1",
    toCardId: "c2",
    source: { turnId: "t", text: "x" },
  },
  {
    id: "e2",
    kind: "deepen",
    fromCardId: "c2",
    toCardId: "c3",
    source: { turnId: "t", text: "x" },
  },
  {
    id: "e3",
    kind: "diverge",
    fromCardId: "c2",
    toCardId: "c4",
    source: { turnId: "t", text: "x" },
  },
  {
    id: "e4",
    kind: "diverge",
    fromCardId: "c2",
    toCardId: "c5",
    source: { turnId: "t", text: "x" },
  },
];

describe("inferFocusNavKind", () => {
  it("returns jump when ids missing or equal", () => {
    expect(inferFocusNavKind(null, "c1", nodes, edges)).toBe("jump");
    expect(inferFocusNavKind("c1", "c1", nodes, edges)).toBe("jump");
  });

  it("parent → deepen child is deepen", () => {
    expect(inferFocusNavKind("c1", "c2", nodes, edges)).toBe("deepen");
    expect(inferFocusNavKind("c2", "c3", nodes, edges)).toBe("deepen");
  });

  it("parent → diverge child is diverge", () => {
    expect(inferFocusNavKind("c2", "c4", nodes, edges)).toBe("diverge");
  });

  it("child → parent is back", () => {
    expect(inferFocusNavKind("c2", "c1", nodes, edges)).toBe("back");
    expect(inferFocusNavKind("c3", "c1", nodes, edges)).toBe("back");
  });

  it("siblings are diverge", () => {
    expect(inferFocusNavKind("c4", "c5", nodes, edges)).toBe("diverge");
    expect(inferFocusNavKind("c3", "c4", nodes, edges)).toBe("diverge");
  });
});
