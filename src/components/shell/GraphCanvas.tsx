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

function roleOf(n: GraphInput, focusId: string): NodeRole {
  if ("role" in n && n.role) return n.role;
  return n.id === focusId ? "focus" : "context";
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
              pulse={pulseIds.has(n.id)}
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
  pulse,
  onSelect,
}: {
  n: LaidOutNode<GraphInput>;
  role: NodeRole;
  on: boolean;
  showLabel: boolean;
  pulse: boolean;
  onSelect: (id: string) => void;
}) {
  const r = radiusFor(role, on);
  const hit = Math.max(r, 14); // min hit radius in layout units
  const label =
    n.title.length > 10 ? `${n.title.slice(0, 9)}…` : n.title;
  return (
    <g
      className={`graph-node role-${role}${on ? " on" : ""}${n.unread ? " unread" : ""}${pulse ? " pulse" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(n.id);
      }}
      onPointerDown={(e) => e.stopPropagation()}
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
