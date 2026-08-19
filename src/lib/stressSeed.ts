import type { InquiryNode, NodeKind, Turn, WorkspaceSnapshot } from "../types";

function turn(id: string, title: string): Turn {
  return {
    id,
    title,
    collapsed: false,
    user: title,
    think: "",
    thinkOpen: false,
    aiHtml: `<p>压测占位 · ${title}</p>`,
  };
}

function node(
  id: string,
  title: string,
  parentId: string | null,
  kind: NodeKind,
  unread = false,
): InquiryNode {
  return { id, title, parentId, kind, unread };
}

function pack(
  nodes: InquiryNode[],
  focusId: string,
): WorkspaceSnapshot {
  const turnsByCardId: Record<string, Turn[]> = {};
  for (const n of nodes) {
    turnsByCardId[n.id] = [turn(`t-${n.id}`, n.title)];
  }
  return { source: "demo", focusId, nodes, turnsByCardId };
}

/** 1 root + mid + n diverge children under mid. */
export function stressFan(n = 80): WorkspaceSnapshot {
  const nodes: InquiryNode[] = [
    node("sf-root", "压测根", null, "root"),
    node("sf-mid", "扇出中继", "sf-root", "deepen"),
  ];
  for (let i = 0; i < n; i++) {
    nodes.push(
      node(
        `sf-d${i}`,
        `发散 ${String(i + 1).padStart(2, "0")}`,
        "sf-mid",
        "diverge",
        i % 7 === 0,
      ),
    );
  }
  return pack(nodes, "sf-mid");
}

/** Pure deepen chain of depth d (d nodes under root → total d+1). */
export function stressDeep(d = 40): WorkspaceSnapshot {
  const nodes: InquiryNode[] = [node("sd-0", "深链根", null, "root")];
  for (let i = 1; i <= d; i++) {
    nodes.push(
      node(`sd-${i}`, `深挖 L${i}`, `sd-${i - 1}`, "deepen", i === d),
    );
  }
  return pack(nodes, `sd-${d}`);
}

/** Balanced-ish bushy tree ~n nodes. */
export function stressBushy(n = 100): WorkspaceSnapshot {
  const nodes: InquiryNode[] = [node("sb-0", "灌木根", null, "root")];
  let i = 1;
  const queue = ["sb-0"];
  while (i < n && queue.length) {
    const parent = queue.shift()!;
    const branching = 3;
    for (let b = 0; b < branching && i < n; b++) {
      const id = `sb-${i}`;
      const kind: NodeKind = b === 0 ? "deepen" : "diverge";
      nodes.push(node(id, `枝 ${i}`, parent, kind, i % 11 === 0));
      queue.push(id);
      i += 1;
    }
  }
  return pack(nodes, nodes[Math.min(5, nodes.length - 1)]!.id);
}

/** Mixed: moderate depth + fan. */
export function stressMixed(n = 100): WorkspaceSnapshot {
  const fan = Math.min(40, Math.floor(n / 2));
  const deep = Math.max(5, n - fan - 5);
  const a = stressDeep(deep);
  const b = stressFan(fan);
  // merge with id prefixes already distinct sd-/sf-
  const nodes = [...a.nodes, ...b.nodes];
  const turnsByCardId = { ...a.turnsByCardId, ...b.turnsByCardId };
  return {
    source: "demo",
    focusId: a.focusId,
    nodes,
    turnsByCardId,
  };
}
