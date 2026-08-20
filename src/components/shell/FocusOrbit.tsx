import {
  useCallback,
  useEffect,
  useId,
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

type WheelLayerProps = {
  items: OrbitItem[];
  activeIndex: number;
  focusId: string;
  label: string;
  /** Visual stack depth: 0 = innermost wheel under center */
  layer: number;
  reduced: boolean;
  onActivate: (index: number) => void;
  onCommit: (id: string) => void;
};

/**
 * One Option-Wheel layer: curved vertical list, active in the middle.
 * Layers stack with offset so multiple wheels read as concentric / stacked.
 */
function WheelLayer({
  items,
  activeIndex,
  focusId,
  label,
  layer,
  reduced,
  onActivate,
  onCommit,
}: WheelLayerProps) {
  const listId = useId();
  if (!items.length) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
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
    }
  };

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) < 0.5 && Math.abs(e.deltaX) < 0.5) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    const next = clampIndex(activeIndex + (delta > 0 ? 1 : -1), items.length);
    if (next === activeIndex) return;
    onActivate(next);
    onCommit(items[next]!.id);
  };

  // Window of neighbors around active (Option Wheel shows a slice)
  const windowRadius = 2;
  const visible = items.map((item, i) => {
    const dist = i - activeIndex;
    return { item, i, dist, abs: Math.abs(dist) };
  });

  return (
    <div
      className={`fo-wheel fo-wheel--L${layer}${reduced ? " is-flat" : ""}`}
      style={
        {
          "--fo-layer": layer,
        } as CSSProperties
      }
      role="listbox"
      aria-label={label}
      aria-activedescendant={
        items[activeIndex]
          ? `${listId}-${items[activeIndex]!.id}`
          : undefined
      }
      tabIndex={0}
      onKeyDown={onKeyDown}
      onWheel={onWheel}
    >
      <div className="fo-wheel__track" aria-hidden={!items.length}>
        {visible.map(({ item, i, dist, abs }) => {
          if (!reduced && abs > windowRadius) return null;

          const t = Math.min(abs / windowRadius, 1);
          // Curve: options fan on a vertical arc (React Bits Option Wheel)
          const curve = reduced ? 0 : 1 - t * t;
          const y = reduced ? 0 : dist * (26 - layer * 2);
          const x = reduced ? 0 : curve * (18 + layer * 10) + layer * 6;
          const scale = reduced ? 1 : 1.06 - t * 0.18 - layer * 0.04;
          const opacity = reduced
            ? 1
            : Math.max(0.22, 1 - t * 0.55 - layer * 0.08);
          const blur = reduced || abs === 0 ? 0 : t * (1.4 + layer * 0.3);

          const style: CSSProperties = reduced
            ? {}
            : {
                transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
                opacity,
                filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none",
                zIndex: 30 - abs - layer,
              };

          return (
            <button
              key={item.id}
              id={`${listId}-${item.id}`}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              data-kind={item.kind}
              className={[
                "fo-wheel__item",
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
              <span className="fo-wheel__glyph" aria-hidden="true">
                {kindGlyph(item.kind)}
              </span>
              <span className="fo-wheel__label">{item.title}</span>
              {item.unread ? (
                <span className="fo-wheel__unread" aria-label="未读" />
              ) : null}
            </button>
          );
        })}
      </div>
      {!reduced && (
        <div className="fo-wheel__arc" aria-hidden="true" />
      )}
    </div>
  );
}

/**
 * Stacked Option Wheels for the left rail.
 * Center = root; each deeper ring is another wheel layer offset outward.
 */
export default function FocusOrbit({
  model,
  onSelect,
  className = "",
}: FocusOrbitProps) {
  const reduced = usePrefersReducedMotion();
  const ring1 = model.rings[1] ?? [];
  const ring2 = model.rings[2] ?? [];

  const pickActive = useCallback(
    (items: OrbitItem[], ring: 1 | 2) => {
      if (!items.length) return 0;
      if (items.some((it) => it.id === model.focusId)) {
        return indexOfId(items, model.focusId);
      }
      if (ring === 1 && (model.rings[2] ?? []).length) {
        const outerParent = model.rings[2]![0]?.parentId;
        if (outerParent && items.some((it) => it.id === outerParent)) {
          return indexOfId(items, outerParent);
        }
      }
      return 0;
    },
    [model.focusId, model.rings],
  );

  const [active1, setActive1] = useState(() => pickActive(ring1, 1));
  const [active2, setActive2] = useState(() => pickActive(ring2, 2));

  useEffect(() => {
    setActive1(pickActive(ring1, 1));
  }, [ring1, pickActive, model.focusId]);

  useEffect(() => {
    setActive2(pickActive(ring2, 2));
  }, [ring2, pickActive, model.focusId]);

  const commit = useCallback(
    (id: string) => {
      onSelect(id);
    },
    [onSelect],
  );

  const centerTitle = model.center?.title ?? "—";

  if (!model.center && !ring1.length && !ring2.length) {
    return (
      <div className={`focus-orbit${className ? ` ${className}` : ""}`}>
        <p className="focus-orbit__empty">无探究</p>
      </div>
    );
  }

  return (
    <div
      className={`focus-orbit focus-orbit--stack${className ? ` ${className}` : ""}${reduced ? " is-reduced" : ""}`}
      data-focus={model.focusId || undefined}
    >
      {/* Hub = root card (center of stacked wheels) */}
      {model.center ? (
        <button
          type="button"
          className={[
            "fo-hub",
            model.center.id === model.focusId ? "is-focus" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={`根探究 ${centerTitle}`}
          title={centerTitle}
          onClick={() => commit(model.center!.id)}
        >
          <span className="fo-hub__ring" aria-hidden />
          <span className="fo-hub__label">{centerTitle}</span>
        </button>
      ) : null}

      {/* Stacked option wheels — each layer is one concentric ring */}
      <div className="fo-stack" aria-label="叠轮轨道">
        {ring1.length > 0 ? (
          <WheelLayer
            items={ring1}
            activeIndex={clampIndex(active1, ring1.length)}
            focusId={model.focusId}
            label="内轮 · 根下分支"
            layer={0}
            reduced={reduced}
            onActivate={setActive1}
            onCommit={commit}
          />
        ) : (
          <p className="focus-orbit__empty subtle">根下尚无分支</p>
        )}

        {ring2.length > 0 ? (
          <WheelLayer
            items={ring2}
            activeIndex={clampIndex(active2, ring2.length)}
            focusId={model.focusId}
            label="外轮 · 当前层"
            layer={1}
            reduced={reduced}
            onActivate={setActive2}
            onCommit={commit}
          />
        ) : null}
      </div>
    </div>
  );
}
