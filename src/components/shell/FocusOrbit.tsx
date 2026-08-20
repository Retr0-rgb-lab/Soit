import {
  useCallback,
  useEffect,
  useId,
  useState,
  type KeyboardEvent,
  type WheelEvent,
} from "react";
import type { OrbitItem, OrbitModel } from "../../lib/orbitLayout";
import "./FocusOrbit.css";

export type FocusOrbitProps = {
  model: OrbitModel;
  onSelect: (id: string) => void;
  /** Optional unpin for center when it is a live root */
  onUnpinCenter?: (id: string) => void;
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

type WheelListProps = {
  items: OrbitItem[];
  activeIndex: number;
  focusId: string;
  label: string;
  ring: 1 | 2;
  reduced: boolean;
  onActivate: (index: number) => void;
  onCommit: (id: string) => void;
};

/** Vertical Option-Wheel style list (full rail width). */
function WheelList({
  items,
  activeIndex,
  focusId,
  label,
  ring,
  reduced,
  onActivate,
  onCommit,
}: WheelListProps) {
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

  return (
    <div
      className={`focus-orbit__wheel focus-orbit__wheel--${ring}${reduced ? " is-flat" : ""}`}
      role="listbox"
      aria-label={label}
      aria-activedescendant={
        items[activeIndex] ? `${listId}-${items[activeIndex]!.id}` : undefined
      }
      tabIndex={0}
      onKeyDown={onKeyDown}
      onWheel={onWheel}
    >
      {items.map((item, i) => {
        const dist = i - activeIndex;
        const abs = Math.abs(dist);
        const t = Math.min(abs / 2.5, 1);
        // Option Wheel: slight offset + fade; keep blur mild so labels stay readable
        const style = reduced
          ? undefined
          : {
              opacity: Math.max(1 - t * (ring === 1 ? 0.42 : 0.38), 0.42),
              transform: `translate3d(${t * (ring === 1 ? 8 : 6)}px, 0, 0) scale(${1.02 - t * 0.08})`,
              filter:
                abs === 0 ? "none" : `blur(${(t * (ring === 1 ? 0.9 : 0.7)).toFixed(2)}px)`,
              zIndex: 10 - abs,
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
 * Focus orbit — vertical multi-ring (Option Wheel–inspired) for the left rail.
 * Full-width center chip + stacked wheels (no side-by-side squeeze).
 */
export default function FocusOrbit({
  model,
  onSelect,
  onUnpinCenter,
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
      // Ring 1: highlight the branch that contains focus (parent of outer items)
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
      className={`focus-orbit${className ? ` ${className}` : ""}${reduced ? " is-reduced" : ""}`}
      data-focus={model.focusId || undefined}
    >
      {model.center ? (
        <div className="focus-orbit__center-row">
          <button
            type="button"
            className={[
              "focus-orbit__center",
              model.center.id === model.focusId ? "is-focus" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={`根探究 ${centerTitle}`}
            title={centerTitle}
            onClick={() => commit(model.center!.id)}
          >
            <span className="focus-orbit__center-glyph" aria-hidden>
              ●
            </span>
            <span className="focus-orbit__center-label">{centerTitle}</span>
          </button>
          {onUnpinCenter ? (
            <button
              type="button"
              className="focus-orbit__unpin"
              title="移出活线（注意力，不改探究状态）"
              aria-label={`移出活线 ${centerTitle}`}
              onClick={() => onUnpinCenter(model.center!.id)}
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}

      {ring1.length > 0 ? (
        <WheelList
          items={ring1}
          activeIndex={clampIndex(active1, ring1.length)}
          focusId={model.focusId}
          label="内环 · 根下分支"
          ring={1}
          reduced={reduced}
          onActivate={setActive1}
          onCommit={commit}
        />
      ) : (
        <p className="focus-orbit__empty subtle">根下尚无分支</p>
      )}

      {ring2.length > 0 ? (
        <>
          <div className="focus-orbit__ring-sep" aria-hidden />
          <WheelList
            items={ring2}
            activeIndex={clampIndex(active2, ring2.length)}
            focusId={model.focusId}
            label="外环 · 当前层"
            ring={2}
            reduced={reduced}
            onActivate={setActive2}
            onCommit={commit}
          />
        </>
      ) : null}
    </div>
  );
}
