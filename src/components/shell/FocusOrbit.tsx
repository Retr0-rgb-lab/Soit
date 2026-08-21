import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { OrbitModel, OrbitWorldNode } from "../../lib/orbitLayout";
import {
  navigateOrbit,
  orbitKeyFromKeyboard,
} from "../../lib/orbitNav";
import "./FocusOrbit.css";

export type FocusOrbitProps = {
  model: OrbitModel;
  onSelect: (id: string) => void;
  className?: string;
  /** Square viewport (rail default 248). Ignored if stageWidth/Height set. */
  stageSize?: number;
  /** Full-bleed rectangular viewport (global orbit — whole screen). */
  stageWidth?: number;
  stageHeight?: number;
  /**
   * Obsidian-like free camera: drag empty canvas to pan, wheel to zoom.
   * Rail keeps spatial nav wheel; global stage uses panZoom.
   */
  panZoom?: boolean;
};

const DEFAULT_STAGE = 248;
const SCALE_MIN = 0.35;
const SCALE_MAX = 2.8;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

/**
 * Stable world graph + camera.
 * - Rail: auto-pan to focus; wheel/keys = spatial node nav (no free zoom).
 * - Global (`panZoom`): drag pan + wheel zoom like Obsidian graph.
 */
export default function FocusOrbit({
  model,
  onSelect,
  className = "",
  stageSize = DEFAULT_STAGE,
  stageWidth,
  stageHeight,
  panZoom = false,
}: FocusOrbitProps) {
  const STAGE_W =
    stageWidth && stageWidth > 0
      ? stageWidth
      : stageSize > 0
        ? stageSize
        : DEFAULT_STAGE;
  const STAGE_H =
    stageHeight && stageHeight > 0
      ? stageHeight
      : stageSize > 0
        ? stageSize
        : DEFAULT_STAGE;
  const CX = STAGE_W / 2;
  const CY = STAGE_H / 2;

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const focusIdRef = useRef(model.focusId);
  focusIdRef.current = model.focusId;

  const world = model.world ?? [];
  const edges = model.edges ?? [];
  const cone = useMemo(() => new Set(model.coneIds ?? []), [model.coneIds]);

  /** PEL-165: hover → same ring + path to root + descendants to leaves. */
  const [hoverId, setHoverId] = useState<string | null>(null);

  const navPoints = useMemo(
    () => world.map((n) => ({ id: n.id, x: n.x, y: n.y })),
    [world],
  );
  const navPointsRef = useRef(navPoints);
  navPointsRef.current = navPoints;

  const byId = useMemo(() => {
    const m = new Map<string, OrbitWorldNode>();
    for (const n of world) m.set(n.id, n);
    return m;
  }, [world]);

  const childrenByParent = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const n of world) {
      if (!n.parentId) continue;
      const list = m.get(n.parentId) ?? [];
      list.push(n.id);
      m.set(n.parentId, list);
    }
    return m;
  }, [world]);

  const hoverHighlight = useMemo(() => {
    if (!hoverId) return null;
    const seed = byId.get(hoverId);
    if (!seed) return null;
    const hiNodes = new Set<string>([hoverId]);
    const edgeKeys = new Set<string>();

    // Path to root
    let cur: OrbitWorldNode | undefined = seed;
    const seenUp = new Set<string>();
    while (cur && !seenUp.has(cur.id)) {
      seenUp.add(cur.id);
      hiNodes.add(cur.id);
      if (cur.parentId) {
        edgeKeys.add(`${cur.parentId}->${cur.id}`);
        cur = byId.get(cur.parentId);
      } else {
        break;
      }
    }

    // Same ring (same depth)
    for (const n of world) {
      if (n.depth === seed.depth) hiNodes.add(n.id);
    }

    // Path to leaves (all descendants)
    const stack = [...(childrenByParent.get(hoverId) ?? [])];
    const seenDown = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (seenDown.has(id)) continue;
      seenDown.add(id);
      hiNodes.add(id);
      const parent = byId.get(id)?.parentId;
      if (parent) edgeKeys.add(`${parent}->${id}`);
      for (const c of childrenByParent.get(id) ?? []) stack.push(c);
    }

    return { nodes: hiNodes, edgeKeys };
  }, [hoverId, byId, world, childrenByParent]);

  const focusNode = byId.get(model.focusId) ?? world[0] ?? null;

  /** Auto camera: place focus near stage center (rail + initial global fit). */
  const autoCam = useMemo(() => {
    if (!focusNode) return { x: CX, y: CY };
    const pts = world.filter((n) => cone.has(n.id));
    let cx = focusNode.x;
    let cy = focusNode.y;
    if (pts.length > 1) {
      let sx = 0;
      let sy = 0;
      for (const p of pts) {
        sx += p.x;
        sy += p.y;
      }
      const mx = sx / pts.length;
      const my = sy / pts.length;
      cx = focusNode.x * 0.75 + mx * 0.25;
      cy = focusNode.y * 0.75 + my * 0.25;
    }
    return { x: CX - cx, y: CY - cy };
  }, [focusNode, world, cone, CX, CY]);

  /** Free camera (global): pan offset + scale on top of autoCam at last fit. */
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const autoCamRef = useRef(autoCam);
  autoCamRef.current = autoCam;

  // When focus changes in rail mode, camera follows via autoCam.
  // In panZoom, soft-recenter only if user hasn't dragged (optional): reset on model focus change lightly.
  useEffect(() => {
    if (!panZoom) return;
    // New global open / focus: snap to auto frame once
    setView({ x: autoCam.x, y: autoCam.y, scale: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fit when focus id changes
  }, [panZoom, model.focusId]);

  const go = useCallback(
    (nextId: string) => {
      if (nextId && nextId !== focusIdRef.current) {
        focusIdRef.current = nextId;
        onSelect(nextId);
      }
    },
    [onSelect],
  );

  // Rail: wheel = spatial nav. Global panZoom: wheel = zoom toward cursor.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) < 0.5 && Math.abs(e.deltaY) < 0.5) return;
      e.preventDefault();
      e.stopPropagation();

      if (!panZoom) {
        go(
          navigateOrbit(navPointsRef.current, focusIdRef.current, {
            type: "wheel",
            dx: e.deltaX,
            dy: e.deltaY,
          }),
        );
        return;
      }

      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;

      setView((prev) => {
        const nextScale = clamp(prev.scale * factor, SCALE_MIN, SCALE_MAX);
        const k = nextScale / prev.scale;
        // Keep world point under cursor fixed
        const nextX = mx - k * (mx - prev.x);
        const nextY = my - k * (my - prev.y);
        return { x: nextX, y: nextY, scale: nextScale };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [go, panZoom]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (panZoom) {
      // Arrow keys pan the canvas (Obsidian-like nudge)
      const step = 36 / (viewRef.current.scale || 1);
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = step;
      else if (e.key === "ArrowRight") dx = -step;
      else if (e.key === "ArrowUp") dy = step;
      else if (e.key === "ArrowDown") dy = -step;
      else if (e.key === "0" || e.key === "Home") {
        e.preventDefault();
        setView({ x: autoCamRef.current.x, y: autoCamRef.current.y, scale: 1 });
        return;
      } else {
        return;
      }
      e.preventDefault();
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      return;
    }

    const k = orbitKeyFromKeyboard(e.key);
    if (!k) return;
    e.preventDefault();
    e.stopPropagation();
    go(
      navigateOrbit(navPointsRef.current, focusIdRef.current, {
        type: "key",
        key: k,
      }),
    );
  };

  const onStagePointerDown = (e: ReactPointerEvent) => {
    rootRef.current?.focus({ preventScroll: true });
    if (!panZoom || e.button !== 0) return;
    const t = e.target;
    if (t instanceof Element && t.closest(".fo-node")) return;

    e.preventDefault();
    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: viewRef.current.x,
      origY: viewRef.current.y,
      moved: false,
    };
    setDragging(true);
  };

  const onStagePointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && dx * dx + dy * dy < 9) return;
    d.moved = true;
    setView((v) => ({
      ...v,
      x: d.origX + dx,
      y: d.origY + dy,
    }));
  };

  const endPan = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const resetView = useCallback(() => {
    setView({ x: autoCam.x, y: autoCam.y, scale: 1 });
  }, [autoCam.x, autoCam.y]);

  if (!world.length) {
    return (
      <div className={`focus-orbit${className ? ` ${className}` : ""}`}>
        <p className="focus-orbit__empty">无探究</p>
      </div>
    );
  }

  const focusTitle = focusNode?.title ?? "—";

  const camX = panZoom ? view.x : autoCam.x;
  const camY = panZoom ? view.y : autoCam.y;
  const scale = panZoom ? view.scale : 1;

  // Pan in whole pixels when scale≈1 to avoid subpixel smear on dots/labels.
  const px = panZoom && Math.abs(scale - 1) < 0.02 ? Math.round(camX) : camX;
  const py = panZoom && Math.abs(scale - 1) < 0.02 ? Math.round(camY) : camY;

  const worldStyle = {
    transform: `translate3d(${px}px, ${py}px, 0) scale(${scale})`,
    transition: dragging || panZoom ? "none" : undefined,
  } as CSSProperties;

  // Inverse-scale nodes so discs/labels stay ~1 device-pixel crisp under CSS zoom.
  const nodeInv = panZoom && scale !== 0 ? 1 / scale : 1;

  return (
    <div
      ref={rootRef}
      className={[
        "focus-orbit",
        "focus-orbit--camera",
        panZoom ? "focus-orbit--panzoom" : "",
        dragging ? "is-panning" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-focus={model.focusId || undefined}
      data-hub={model.hub?.id || undefined}
      tabIndex={0}
      role="application"
      aria-label={
        panZoom
          ? `全局探究图，当前 ${focusTitle}。拖动平移，滚轮缩放，点击节点打开卡片。`
          : `探究图，当前 ${focusTitle}。方向键按图上方位移动。`
      }
      onKeyDown={onKeyDown}
    >
      <div
        ref={stageRef}
        className={`fo-stage${panZoom ? " fo-stage--bleed" : ""}`}
        style={{ width: STAGE_W, height: STAGE_H }}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onDoubleClick={(e) => {
          if (!panZoom) return;
          if ((e.target as Element).closest?.(".fo-node")) return;
          resetView();
        }}
      >
        {/* Rail only: vignette. Global bleed has no edge mask / box. */}
        {!panZoom ? <div className="fo-stage__mask" aria-hidden /> : null}

        <div className="fo-world" style={worldStyle}>
          <svg
            className="fo-svg fo-svg--world"
            viewBox="-400 -400 800 800"
            width={800}
            height={800}
            aria-hidden
          >
            {/* PEL-162: no concentric depth rings — edges only */}
            {edges.map((e) => {
              const a = byId.get(e.fromId);
              const b = byId.get(e.toId);
              if (!a || !b) return null;
              const edgeKey = `${e.fromId}->${e.toId}`;
              const hoverHot = hoverHighlight?.edgeKeys.has(edgeKey) ?? false;
              const hoverDim = Boolean(hoverHighlight) && !hoverHot;
              const onPath = cone.has(e.fromId) && cone.has(e.toId);
              const active =
                e.fromId === model.focusId || e.toId === model.focusId;
              return (
                <line
                  key={`${e.fromId}-${e.toId}`}
                  className={[
                    "fo-spoke fo-spoke--depth",
                    onPath ? "is-cone" : "is-dim",
                    active ? "is-active" : "",
                    hoverHot ? "is-hover-hot" : "",
                    hoverDim ? "is-hover-dim" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                />
              );
            })}
          </svg>

          {world.map((n) => {
            const isFocus = n.id === model.focusId;
            const inCone = cone.has(n.id);
            const hoverHot = hoverHighlight?.nodes.has(n.id) ?? false;
            const hoverDim = Boolean(hoverHighlight) && !hoverHot;
            const len = Math.hypot(n.x, n.y) || 1;
            const ox = n.depth === 0 ? 0 : (n.x / len) * 22;
            const oy = n.depth === 0 ? 22 : (n.y / len) * 22;
            return (
              <button
                key={n.id}
                type="button"
                className={[
                  "fo-node",
                  `fo-node--${n.kind}`,
                  isFocus ? "is-focus" : "",
                  // Global view: keep all nodes readable (no heavy fog)
                  panZoom ? "is-cone" : inCone ? "is-cone" : "is-dim",
                  n.unread ? "is-unread" : "",
                  hoverHot ? "is-hover-hot" : "",
                  hoverDim ? "is-hover-dim" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  left: n.x,
                  top: n.y,
                  // Counter CSS world scale → sharp discs & type at any zoom
                  transform: `translate(-50%, -50%) scale(${nodeInv})`,
                }}
                title={n.title}
                aria-label={`${n.kind === "deepen" ? "深挖" : n.kind === "diverge" ? "发散" : "根"} ${n.title}`}
                aria-current={isFocus ? "true" : undefined}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerEnter={() => setHoverId(n.id)}
                onPointerLeave={() =>
                  setHoverId((cur) => (cur === n.id ? null : cur))
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(n.id);
                }}
              >
                <span
                  className="fo-node__dot"
                  aria-hidden
                  data-focus={isFocus ? "1" : "0"}
                  style={{
                    background: isFocus
                      ? "var(--graph-node-root)"
                      : "var(--bg-card)",
                    borderColor: isFocus
                      ? "var(--graph-node-root)"
                      : n.kind === "diverge"
                        ? "var(--graph-node-diverge)"
                        : n.kind === "deepen"
                          ? "var(--graph-node-deepen)"
                          : "var(--graph-node-path)",
                    boxShadow: isFocus
                      ? "0 0 0 3px color-mix(in srgb, var(--focus) 32%, transparent)"
                      : n.unread
                        ? "0 0 0 2px color-mix(in srgb, var(--graph-unread) 40%, transparent)"
                        : "0 0 0 1px color-mix(in srgb, var(--ink) 6%, transparent)",
                  }}
                />
                <span
                  className="fo-node__label"
                  style={{
                    left: `calc(50% + ${ox}px)`,
                    top: `calc(50% + ${oy}px)`,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  {n.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {panZoom ? (
        <div className="fo-cam-bar" aria-hidden={false}>
          <p className="fo-now" aria-live="polite">
            <span className="fo-now__k">当前</span>
            <span className="fo-now__v">{focusTitle}</span>
          </p>
          <div className="fo-cam-actions">
            <button
              type="button"
              className="fo-cam-btn"
              onClick={resetView}
              title="重置视角 (0)"
            >
              重置视角
            </button>
            <span className="fo-cam-scale">{Math.round(scale * 100)}%</span>
          </div>
          <p className="fo-hint" aria-hidden="true">
            拖动画布平移 · 滚轮缩放 · 双击空白重置 · 点击节点打开卡片
          </p>
        </div>
      ) : (
        <>
          <p className="fo-now" aria-live="polite">
            <span className="fo-now__k">当前</span>
            <span className="fo-now__v">{focusTitle}</span>
          </p>
          <p className="fo-hint" aria-hidden="true">
            视角跟随 · 方向键按图上方位
          </p>
        </>
      )}
    </div>
  );
}
