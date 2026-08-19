import { useMemo } from "react";
import { layoutGraph, type LaidOutNode } from "../../lib/graphLayout";
import type { MapNodeView, NodeRole } from "../../lib/mapScope";
import { kindGlyph } from "../../lib/treeNav";
import type { InquiryNode } from "../../types";

export type LabelMode = "all" | "lod" | "none";

type GraphInput = InquiryNode | MapNodeView;

type Props = {
  nodes: GraphInput[];
  focusId: string;
  /** @deprecated prefer labelMode */
  showLabels?: boolean;
  labelMode?: LabelMode;
  className?: string;
  onSelect: (id: string) => void;
  ariaLabel?: string;
};

function roleOf(n: GraphInput, focusId: string): NodeRole {
  if ("role" in n && n.role) return n.role;
  return n.id === focusId ? "focus" : "context";
}

function showLabelFor(role: NodeRole, mode: LabelMode): boolean {
  if (mode === "none") return false;
  if (mode === "all") return true;
  // lod
  return role === "focus" || role === "path" || role === "aggregate";
}

export default function GraphCanvas({
  nodes,
  focusId,
  showLabels,
  labelMode,
  className,
  onSelect,
  ariaLabel = "inquiry graph",
}: Props) {
  const mode: LabelMode =
    labelMode ?? (showLabels ? "all" : "none");

  const laid = useMemo(() => layoutGraph(nodes), [nodes]);
  const byId = useMemo(
    () => new Map(laid.map((n) => [n.id, n] as const)),
    [laid],
  );

  if (laid.length === 0) {
    return (
      <div className={`graph-canvas empty ${className ?? ""}`.trim()}>
        <p className="graph-empty">还没有探究节点</p>
      </div>
    );
  }

  return (
    <div className={`graph-canvas ${className ?? ""}`.trim()}>
      <svg
        viewBox="0 0 200 300"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaLabel}
      >
        {laid
          .filter((n) => n.parentId && byId.has(n.parentId))
          .map((n) => {
            const p = byId.get(n.parentId!)!;
            const midY = (p.y + n.y) / 2;
            const rN = roleOf(n, focusId);
            const rP = roleOf(p, focusId);
            const pathish = (r: NodeRole) => r === "focus" || r === "path";
            const hot = pathish(rN) || pathish(rP);
            const field =
              !hot && (rN === "field" || rP === "field");
            return (
              <path
                key={`e-${n.id}`}
                className={`graph-edge${hot ? " hot" : ""}${field ? " field" : ""}`}
                d={`M${p.x.toFixed(1)} ${p.y.toFixed(1)} C${p.x.toFixed(1)} ${midY.toFixed(1)}, ${n.x.toFixed(1)} ${midY.toFixed(1)}, ${n.x.toFixed(1)} ${n.y.toFixed(1)}`}
                fill="none"
              />
            );
          })}
        {laid.map((n) => {
          const role = roleOf(n, focusId);
          return (
            <GraphNode
              key={n.id}
              n={n}
              role={role}
              on={n.id === focusId || role === "focus"}
              showLabel={showLabelFor(role, mode)}
              onSelect={onSelect}
            />
          );
        })}
      </svg>
    </div>
  );
}

function radiusFor(role: NodeRole, on: boolean): number {
  if (on || role === "focus") return 12;
  if (role === "path") return 10;
  if (role === "aggregate") return 11;
  if (role === "field") return 5.5;
  return 8;
}

function GraphNode({
  n,
  role,
  on,
  showLabel,
  onSelect,
}: {
  n: LaidOutNode<GraphInput>;
  role: NodeRole;
  on: boolean;
  showLabel: boolean;
  onSelect: (id: string) => void;
}) {
  const r = radiusFor(role, on);
  const label =
    n.title.length > 10 ? `${n.title.slice(0, 9)}…` : n.title;
  return (
    <g
      className={`graph-node role-${role}${on ? " on" : ""}${n.unread ? " unread" : ""}`}
      onClick={() => onSelect(n.id)}
      style={{ cursor: "pointer" }}
    >
      <circle className="ring" cx={n.x} cy={n.y} r={r} />
      <circle className="dot" cx={n.x + r - 1} cy={n.y - r + 1} r={3.2} />
      {showLabel && (
        <text
          className="graph-label"
          x={n.x}
          y={n.y + r + 12}
          textAnchor="middle"
        >
          {role === "aggregate" ? label : `${kindGlyph(n.kind)} ${label}`}
        </text>
      )}
      <title>
        {kindGlyph(n.kind)} {n.title}
      </title>
    </g>
  );
}
