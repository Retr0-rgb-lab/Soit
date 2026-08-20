import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type WheelEvent,
} from "react";
import type { OrbitItem, OrbitModel } from "../../lib/orbitLayout";
import "./FocusOrbit.css";

export type FocusOrbitProps = {
  model: OrbitModel;
  onSelect: (id: string) => void;
  className?: string;
};

function kindGlyph(kind: OrbitItem["kind"]): string {
  if (kind === "deepen") return "↓";
  if (kind === "diverge") return "↗";
  return "●";
}

function clampIndex(i: number, len: number): number {
  if (len <= 0) return 0;
  return Math.max(0, Math.min(len - 1, i));
}

function indexOfId(items: OrbitItem[], id: string): number {
  const i = items.findIndex((it) => it.id === id);
  return i >= 0 ? i : 0;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

type RingVisualProps = {
  items: OrbitItem[];
  activeIndex: number;
  focusId: string;
  ring: 1 | 2;
  curve: number;
  spacing: number;
  onActivate: (index: number) => void;
  onCommit: (id: string) => void;
};

function RingArc({
  items,
  activeIndex,
  focusId,
  ring,
  curve,
  spacing,
  onActivate,
  onCommit,
}: RingVisualProps) {
  if (!items.length) return null;

  const mid = (items.length - 1) / 2;

  return (
    <div
      className={`focus-orbit__ring focus-orbit__ring--${ring}`}
      role="listbox"
      aria-label={ring === 1 ? "内环" : "外环"}
      aria-activedescendant={
        items[activeIndex] ? `fo-r${ring}-${items[activeIndex]!.id}` : undefined
      }
      tabIndex={0}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (!items.length) return;
        if (e.key === "ArrowDown" || e.key === "ArrowRight") {
          e.preventDefault();
          const next = clampIndex(activeIndex + 1, items.length);
          onActivate(next);
          onCommit(items[next]!.id);
        } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
          e.preventDefault();
          const next = clampIndex(activeIndex - 1, items.length);
          onActivate(next);
          onCommit(items[next]!.id);
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const cur = items[activeIndex];
          if (cur) onCommit(cur.id);
        } else if (e.key === "Home") {
          e.preventDefault();
          onActivate(0);
          onCommit(items[0]!.id);
        } else if (e.key === "End") {
          e.preventDefault();
          const last = items.length - 1;
          onActivate(last);
          onCommit(items[last]!.id);
        }
      }}
      onWheel={(e: WheelEvent<HTMLDivElement>) => {
        if (!items.length) return;
        if (Math.abs(e.deltaY) < 0.5 && Math.abs(e.deltaX) < 0.5) return;
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
        const step = delta > 0 ? 1 : -1;
        const next = clampIndex(activeIndex + step, items.length);
        if (next === activeIndex) return;
        onActivate(next);
        onCommit(items[next]!.id);
      }}
    >
      {items.map((item, i) => {
        const dist = i - activeIndex;
        const abs = Math.abs(dist);
        // Option Wheel falloff: active sharp; neighbors fade/blur/scale
        const t = Math.min(abs / 3, 1);
        const opacity = ring === 1 ? 1 - t * 0.72 : 0.55 - t * 0.35;
        const scale =
          ring === 1
            ? 1.08 - t * 0.22
            : 0.92 - t * 0.12;
        const blur = t * (ring === 1 ? 2.2 : 2.8);
        // Side arc: bulge toward rail interior (left of labels / right of column)
        const arcX =
          curve * (1 - Math.pow((i - mid) / Math.max(mid, 0.5), 2)) -
          abs * (ring === 1 ? 1.5 : 2.5);
        const y = dist * spacing;

        const style = {
          top: "50%",
          transform: `translate3d(${Math.max(arcX, 0)}px, calc(-50% + ${y}px), 0) scale(${scale})`,
          opacity: Math.max(opacity, 0.12),
          filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none",
          zIndex: 20 - abs,
          fontWeight: abs === 0 ? 600 : 400,
        } as CSSProperties;

        return (
          <button
            key={item.id}
            id={`fo-r${ring}-${item.id}`}
            type="button"
            role="option"
            aria-selected={i === activeIndex}
            data-kind={item.kind}
            className={[
              "focus-orbit__item",
              i === activeIndex ? "is-active" : "",
              item.id === focusId ? "is-focus" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={style}
            title={item.title}
            onClick={() => {
              onActivate(i);
              onCommit(item.id);
            }}
          >
            <span className="focus-orbit__glyph" aria-hidden="true">
              {kindGlyph(item.kind)}
            </span>
            <span className="focus-orbit__label">{item.title}</span>
            {item.unread ? (
              <span className="focus-orbit__unread" aria-label="未读" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Side-arc multi-ring focus selector (Option Wheel–inspired).
 * Center = root chip; ring 1 = children of root; ring 2 = children of focus when deeper.
 */
export default function FocusOrbit({
  model,
  onSelect,
  className = "",
}: FocusOrbitProps) {
  const reduced = usePrefersReducedMotion();
  const ring1 = model.rings[1] ?? [];
  const ring2 = model.rings[2] ?? [];

  const [active1, setActive1] = useState(() =>
    indexOfId(ring1, model.focusId),
  );
  const [active2, setActive2] = useState(() =>
    indexOfId(ring2, model.focusId),
  );

  // Keep active indices aligned when model/focus changes
  useEffect(() => {
    if (!ring1.length) {
      setActive1(0);
      return;
    }
    const inRing = ring1.some((it) => it.id === model.focusId);
    if (inRing) setActive1(indexOfId(ring1, model.focusId));
    else setActive1((i) => clampIndex(i, ring1.length));
  }, [model.focusId, ring1]);

  useEffect(() => {
    if (!ring2.length) {
      setActive2(0);
      return;
    }
    const inRing = ring2.some((it) => it.id === model.focusId);
    if (inRing) setActive2(indexOfId(ring2, model.focusId));
    else setActive2((i) => clampIndex(i, ring2.length));
  }, [model.focusId, ring2]);

  const commit = useCallback(
    (id: string) => {
      onSelect(id);
    },
    [onSelect],
  );

  const fallbackItems = useMemo(() => {
    const out: { group: string; item: OrbitItem }[] = [];
    if (model.center) {
      out.push({ group: "根", item: model.center });
    }
    for (const it of ring1) out.push({ group: "内环", item: it });
    for (const it of ring2) out.push({ group: "外环", item: it });
    return out;
  }, [model.center, ring1, ring2]);

  const rootId = model.center?.id ?? model.rootId;
  const stageRef = useRef<HTMLDivElement>(null);

  if (!model.center && !ring1.length && !ring2.length) {
    return (
      <div
        className={`focus-orbit${className ? ` ${className}` : ""}${reduced ? " is-reduced" : ""}`}
      >
        <p className="focus-orbit__empty">无探究</p>
      </div>
    );
  }

  return (
    <div
      className={`focus-orbit${className ? ` ${className}` : ""}${reduced ? " is-reduced" : ""}`}
      data-focus={model.focusId || undefined}
    >
      <div className="focus-orbit__stage" ref={stageRef}>
        {model.center ? (
          <button
            type="button"
            className={[
              "focus-orbit__center",
              model.center.id === model.focusId ? "is-focus" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label="根探究"
            title={model.center.title}
            onClick={() => commit(model.center!.id)}
            onDoubleClick={() => rootId && commit(rootId)}
          >
            {model.center.title}
          </button>
        ) : (
          <span className="focus-orbit__center" aria-hidden="true">
            —
          </span>
        )}

        <div className="focus-orbit__rings">
          <RingArc
            items={ring1}
            activeIndex={clampIndex(active1, ring1.length)}
            focusId={model.focusId}
            ring={1}
            curve={16}
            spacing={28}
            onActivate={setActive1}
            onCommit={commit}
          />
          {ring2.length > 0 ? (
            <RingArc
              items={ring2}
              activeIndex={clampIndex(active2, ring2.length)}
              focusId={model.focusId}
              ring={2}
              curve={10}
              spacing={22}
              onActivate={setActive2}
              onCommit={commit}
            />
          ) : null}
        </div>
      </div>

      {/* Keyboard / reduced-motion fallback list */}
      <ul className="focus-orbit__fallback" aria-label="探究轨道列表">
        {fallbackItems.map(({ group, item }, idx) => {
          const prevGroup =
            idx > 0 ? fallbackItems[idx - 1]!.group : null;
          return (
            <li key={`${group}-${item.id}`}>
              {group !== prevGroup ? (
                <div className="focus-orbit__fallback-group" aria-hidden="true">
                  {group}
                </div>
              ) : null}
              <button
                type="button"
                className={[
                  "focus-orbit__fallback-btn",
                  item.id === model.focusId ? "is-focus" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-kind={item.kind}
                title={item.title}
                onClick={() => commit(item.id)}
              >
                <span className="focus-orbit__glyph" aria-hidden="true">
                  {kindGlyph(item.kind)}
                </span>
                <span className="focus-orbit__label">{item.title}</span>
                {item.unread ? (
                  <span className="focus-orbit__unread" aria-label="未读" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
