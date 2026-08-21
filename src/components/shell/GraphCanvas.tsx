import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  layoutBounds,
  layoutGraph,
  viewBoxString,
  type LaidOutNode,
  type LayoutBounds,
} from "../../lib/graphLayout";
import type { MapNodeView, NodeRole } from "../../lib/mapScope";
import { kindGlyph } from "../../lib/treeNav";
import type { InquiryNode } from "../../types";

export type LabelMode = "all" | "lod" | "none";

type GraphInput = InquiryNode | MapNodeView;

type Props = {
  nodes: GraphInput[];
  focusId: string;
  showLabels?: boolean;
  labelMode?: LabelMode;
  className?: string;
  onSelect: (id: string) => void;
  ariaLabel?: string;
  /** Enable pan (drag) + wheel zoom. Default false (locus). */
  panZoom?: boolean;
  /** Bump to re-fit camera to content / focus. */
  fitToken?: number;
  fitMode?: "all" | "focus";
};

/**
 * Display role for LOD styling. Always trust live focusId over any baked
 * `role` from mapScope — otherwise locus/map stay stuck on the previous focus.
 */
function roleOf(n: GraphInput, focusId: string): NodeRole {
  if (n.id === focusId) return "focus";
  const baked = "role" in n ? n.role : undefined;
  if (!baked || baked === "focus") {
    // Stale baked "focus" on a non-focus node → treat as context
    return "context";
  }
  return baked;
}

/** Solid black ring follows store focus only. */
function isFocused(n: GraphInput, focusId: string): boolean {
  return n.id === focusId;
}

function showLabelFor(role: NodeRole, mode: LabelMode): boolean {
  if (mode === "none") return false;
  if (mode === "all") return true;
  return role === "focus" || role === "path" || role === "aggregate";
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function fitBounds(
  laid: LaidOutNode<GraphInput>[],
  focusId: string,
  mode: "all" | "focus",
): LayoutBounds {
  if (mode === "focus") {
    const focus = laid.find((n) => n.id === focusId);
    if (focus) {
      // Always keep path-ish nodes + neighborhood so ancestors aren't clipped
      const near = laid.filter((n) => {
        const role = roleOf(n, focusId);
        if (role === "focus" || role === "path" || role === "context") {
          return true;
        }
        const dx = n.x - focus.x;
        const dy = n.y - focus.y;
        return Math.hypot(dx, dy) < 160;
      });
      return layoutBounds(near.length ? near : laid, 56);
    }
  }
  // Extra pad so rings + unread dots never sit on the viewBox edge
  return layoutBounds(laid, 72);
}

export default function GraphCanvas({
  nodes,
  focusId,
  showLabels,
  labelMode,
  className,
  onSelect,
  ariaLabel = "inquiry graph",
  panZoom = false,
  fitToken = 0,
  fitMode = "all",
}: Props) {
  const mode: LabelMode = labelMode ?? (showLabels ? "all" : "none");
  const wrapRef = useRef<HTMLDivElement>(null);

  const laid = useMemo(() => layoutGraph(nodes), [nodes]);
  const byId = useMemo(
    () => new Map(laid.map((n) => [n.id, n] as const)),
    [laid],
  );

  const contentBounds = useMemo(
    () => fitBounds(laid, focusId, "all"),
    [laid, focusId],
  );

  const [vb, setVb] = useState<LayoutBounds>(contentBounds);
  const dragRef = useRef<{
    x: number;
    y: number;
    minX: number;
    minY: number;
  } | null>(null);

  // Re-fit when content or token changes
  useEffect(() => {
    setVb(fitBounds(laid, focusId, fitMode));
  }, [laid, focusId, fitToken, fitMode]);

  const onWheel = useCallback(
    (e: ReactWheelEvent) => {
      if (!panZoom) return;
      e.preventDefault();
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
      setVb((prev) => {
        const nw = clamp(prev.width * factor, 60, contentBounds.width * 6);
        const nh = clamp(prev.height * factor, 60, contentBounds.height * 6);
        const cx = prev.minX + prev.width * mx;
        const cy = prev.minY + prev.height * my;
        return {
          minX: cx - nw * mx,
          minY: cy - nh * my,
          maxX: cx - nw * mx + nw,
          maxY: cy - nh * my + nh,
          width: nw,
          height: nh,
        };
      });
    },
    [panZoom, contentBounds.width, contentBounds.height],
  );

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!panZoom || e.button !== 0) return;
    // only background pan — nodes stopPropagation
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      minX: vb.minX,
      minY: vb.minY,
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragRef.current || !panZoom) return;
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = ((e.clientX - dragRef.current.x) / rect.width) * vb.width;
    const dy = ((e.clientY - dragRef.current.y) / rect.height) * vb.height;
    setVb((prev) => ({
      ...prev,
      minX: dragRef.current!.minX - dx,
      minY: dragRef.current!.minY - dy,
      maxX: dragRef.current!.minX - dx + prev.width,
      maxY: dragRef.current!.minY - dy + prev.height,
    }));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  // Unread pulse budget: only first 3 unread get .pulse class
  const pulseIds = useMemo(() => {
    const u = laid.filter((n) => n.unread).slice(0, 3).map((n) => n.id);
    return new Set(u);
  }, [laid]);

  /** PEL-165: hover → same depth + ancestors + descendants */
  const [hoverId, setHoverId] = useState<string | null>(null);

  const childrenByParent = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const n of laid) {
      if (!n.parentId) continue;
      const list = m.get(n.parentId) ?? [];
      list.push(n.id);
      m.set(n.parentId, list);
    }
    return m;
  }, [laid]);

  const depthOf = useMemo(() => {
    const d = new Map<string, number>();
    const walk = (id: string): number => {
      if (d.has(id)) return d.get(id)!;
      const n = byId.get(id);
      if (!n?.parentId || !byId.has(n.parentId)) {
        d.set(id, 0);
        return 0;
      }
      const v = walk(n.parentId) + 1;
      d.set(id, v);
      return v;
    };
    for (const n of laid) walk(n.id);
    return d;
  }, [laid, byId]);

  const hoverHighlight = useMemo(() => {
    if (!hoverId || !byId.has(hoverId)) return null;
    const hiNodes = new Set<string>([hoverId]);
    const edgeTo = new Set<string>(); // child id whose parent edge is hot
    const seedDepth = depthOf.get(hoverId) ?? 0;

    let cur = byId.get(hoverId);
    const seenUp = new Set<string>();
    while (cur && !seenUp.has(cur.id)) {
      seenUp.add(cur.id);
      hiNodes.add(cur.id);
      if (cur.parentId && byId.has(cur.parentId)) {
        edgeTo.add(cur.id);
        cur = byId.get(cur.parentId);
      } else break;
    }

    for (const n of laid) {
      if ((depthOf.get(n.id) ?? -1) === seedDepth) hiNodes.add(n.id);
    }

    const stack = [...(childrenByParent.get(hoverId) ?? [])];
    const seenDown = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (seenDown.has(id)) continue;
      seenDown.add(id);
      hiNodes.add(id);
      edgeTo.add(id);
      for (const c of childrenByParent.get(id) ?? []) stack.push(c);
    }

    return { nodes: hiNodes, edgeTo };
  }, [hoverId, byId, laid, depthOf, childrenByParent]);

  if (laid.length === 0) {
    return (
      <div className={`graph-canvas empty ${className ?? ""}`.trim()}>
        <p className="graph-empty">还没有探究节点</p>
      </div>
    );
  }

  const vbStr = panZoom ? viewBoxString(vb) : viewBoxString(contentBounds);

  return (
    <div
      ref={wrapRef}
      className={`graph-canvas${panZoom ? " panzoom" : ""} ${className ?? ""}`.trim()}
      onWheel={onWheel}
      onPointerDown={panZoom ? onPointerDown : undefined}
      onPointerMove={panZoom ? onPointerMove : undefined}
      onPointerUp={panZoom ? onPointerUp : undefined}
      onPointerCancel={panZoom ? onPointerUp : undefined}
    >
      <svg
        viewBox={vbStr}
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
            const field = !hot && (rN === "field" || rP === "field");
            const hoverHot = hoverHighlight?.edgeTo.has(n.id) ?? false;
            const hoverDim = Boolean(hoverHighlight) && !hoverHot;
            return (
              <path
                key={`e-${n.id}`}
                className={`graph-edge${hot ? " hot" : ""}${field ? " field" : ""}${hoverHot ? " hover-hot" : ""}${hoverDim ? " hover-dim" : ""}`}
                d={`M${p.x.toFixed(1)} ${p.y.toFixed(1)} C${p.x.toFixed(1)} ${midY.toFixed(1)}, ${n.x.toFixed(1)} ${midY.toFixed(1)}, ${n.x.toFixed(1)} ${n.y.toFixed(1)}`}
                fill="none"
              />
            );
          })}
        {laid.map((n) => {
          const role = roleOf(n, focusId);
          const on = isFocused(n, focusId);
          const hoverHot = hoverHighlight?.nodes.has(n.id) ?? false;
          const hoverDim = Boolean(hoverHighlight) && !hoverHot;
          return (
            <GraphNode
              key={n.id}
              n={n}
              role={role}
              on={on}
              showLabel={showLabelFor(role, mode)}
              pulse={pulseIds.has(n.id) && !on}
              hoverHot={hoverHot}
              hoverDim={hoverDim}
              onSelect={onSelect}
              onHover={setHoverId}
            />
          );
        })}
      </svg>
    </div>
  );
}

function radiusFor(role: NodeRole, on: boolean): number {
  // Minimal spine: smaller rings so locus chip stays calm
  if (on || role === "focus") return 8;
  if (role === "path") return 6;
  if (role === "aggregate") return 5.5;
  if (role === "field") return 2.75;
  return 4.25;
}

function ringPaint(
  role: NodeRole,
  on: boolean,
): { fill: string; stroke: string; strokeWidth: number } {
  if (on || role === "focus") {
    return {
      fill: "var(--graph-node-root)",
      stroke: "var(--graph-node-root)",
      strokeWidth: 1.1,
    };
  }
  if (role === "path") {
    return {
      fill: "var(--graph-node-path)",
      stroke: "none",
      strokeWidth: 0,
    };
  }
  if (role === "aggregate") {
    return {
      fill: "transparent",
      stroke: "var(--graph-node-diverge)",
      strokeWidth: 1.1,
    };
  }
  if (role === "field") {
    return {
      fill: "var(--graph-node-idle)",
      stroke: "none",
      strokeWidth: 0,
    };
  }
  // context — idle fill, no hard ring
  return {
    fill: "var(--graph-node-idle)",
    stroke: "none",
    strokeWidth: 0,
  };
}

function GraphNode({
  n,
  role,
  on,
  showLabel,
  pulse,
  hoverHot,
  hoverDim,
  onSelect,
  onHover,
}: {
  n: LaidOutNode<GraphInput>;
  role: NodeRole;
  on: boolean;
  showLabel: boolean;
  pulse: boolean;
  hoverHot: boolean;
  hoverDim: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const r = radiusFor(role, on);
  const hit = Math.max(r, 14); // min hit radius in layout units
  const paint = ringPaint(role, on);
  const label =
    n.title.length > 10 ? `${n.title.slice(0, 9)}…` : n.title;
  return (
    <g
      className={`graph-node role-${role}${on ? " on" : ""}${n.unread ? " unread" : ""}${pulse ? " pulse" : ""}${hoverHot ? " hover-hot" : ""}${hoverDim ? " hover-dim" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(n.id);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerEnter={() => onHover(n.id)}
      onPointerLeave={() => onHover(null)}
      style={{ cursor: "pointer" }}
    >
      {/* invisible larger hit target */}
      <circle
        className="hit"
        cx={n.x}
        cy={n.y}
        r={hit}
        fill="transparent"
        stroke="none"
      />
      {/* Explicit fill/stroke so focus never lags CSS cascade on SVG */}
      <circle
        className="ring"
        cx={n.x}
        cy={n.y}
        r={r}
        fill={paint.fill}
        stroke={paint.stroke === "none" ? "transparent" : paint.stroke}
        strokeWidth={paint.strokeWidth}
        strokeDasharray={role === "aggregate" && !on ? "2 2" : undefined}
      />
      <circle
        className="dot"
        cx={n.x + r - 1}
        cy={n.y - r + 1}
        r={2}
        fill="var(--graph-unread)"
        opacity={on ? 0 : n.unread ? 1 : 0}
      />
      {showLabel && (
        <text
          className="graph-label"
          x={n.x}
          y={n.y + r + 12}
          textAnchor="middle"
        >
          {/* PEL-164: plain title text (no glyph tab chrome) */}
          {label}
        </text>
      )}
      <title>
        {kindGlyph(n.kind)} {n.title}
      </title>
    </g>
  );
}
