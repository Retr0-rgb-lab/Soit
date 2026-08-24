import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { InquiryNode } from "../../types";
import { ancestorChain } from "../../lib/treeNav";
import LineSidebar from "../card/LineSidebar";
import "./PathLineNav.css";

export type PathLineNavProps = {
  nodes: InquiryNode[];
  focusId: string;
  onSelect: (id: string) => void;
};

/** How many items stay solid in the viewport band. */
const WINDOW = 7;
/** Approx row height (label + gap) for window math */
const ROW_PX = 36;

/**
 * One radial line: root (圆心) → … → focus.
 * Same-ring siblings are NOT included — only the depth spine to the hub.
 */
export function pathLineNodes(
  nodes: InquiryNode[],
  focusId: string,
): InquiryNode[] {
  return ancestorChain(nodes, focusId);
}

/**
 * Lower left-rail Line Sidebar: cards on the line from focus to center.
 * Default band = 7 solid rows; others fade; wheel shifts the band.
 */
export default function PathLineNav({
  nodes,
  focusId,
  onSelect,
}: PathLineNavProps) {
  const [hidden, setHidden] = useState(false);
  const [offset, setOffset] = useState(0);
  const listWrapRef = useRef<HTMLDivElement>(null);

  const list = useMemo(
    () => pathLineNodes(nodes, focusId),
    [nodes, focusId],
  );

  const labels = useMemo(() => list.map((n) => n.title), [list]);

  const focusIndex = useMemo(() => {
    const i = list.findIndex((n) => n.id === focusId);
    return i >= 0 ? i : Math.max(0, list.length - 1);
  }, [list, focusId]);

  const maxOffset = Math.max(0, list.length - WINDOW);

  // Keep focus (usually the last / outermost) inside the solid window
  useEffect(() => {
    setOffset((o) => {
      if (list.length <= WINDOW) return 0;
      if (focusIndex < o) return focusIndex;
      if (focusIndex >= o + WINDOW) return focusIndex - WINDOW + 1;
      return Math.min(o, maxOffset);
    });
  }, [focusIndex, list.length, maxOffset]);

  const clampOffset = useCallback(
    (o: number) => Math.max(0, Math.min(maxOffset, o)),
    [maxOffset],
  );

  useEffect(() => {
    const el = listWrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (list.length <= WINDOW) return;
      if (Math.abs(e.deltaY) < 0.5) return;
      e.preventDefault();
      e.stopPropagation();
      const dir = e.deltaY > 0 ? 1 : -1;
      setOffset((o) => clampOffset(o + dir));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [clampOffset, list.length]);

  const itemFade = useCallback(
    (index: number): number => {
      if (list.length <= WINDOW) return 1;
      if (index >= offset && index < offset + WINDOW) {
        const local = index - offset;
        if (local === 0 || local === WINDOW - 1) return 0.72;
        return 1;
      }
      const dist =
        index < offset
          ? offset - index
          : index - (offset + WINDOW - 1);
      return Math.max(0.06, 0.42 - dist * 0.12);
    },
    [list.length, offset],
  );

  if (list.length === 0) {
    return (
      <div className="path-line-nav path-line-nav--empty">
        <p className="path-line-nav__empty">无线上卡片</p>
      </div>
    );
  }

  if (hidden) {
    return (
      <div className="path-line-nav path-line-nav--collapsed">
        <button
          type="button"
          className="path-line-nav__show"
          onClick={() => setHidden(false)}
          title="显示深度路径"
        >
          显示路径
        </button>
      </div>
    );
  }

  const windowH = Math.min(WINDOW, list.length) * ROW_PX + 12;

  return (
    <div className="path-line-nav">
      <div className="path-line-nav__head">
        <span className="path-line-nav__title">深度路径</span>
        <div className="path-line-nav__head-actions">
          {list.length > WINDOW && (
            <span className="path-line-nav__meta" aria-hidden>
              {offset + 1}–{Math.min(offset + WINDOW, list.length)}/
              {list.length}
            </span>
          )}
          <button
            type="button"
            className="path-line-nav__hide"
            aria-label="隐藏深度路径"
            title="隐藏路径"
            onClick={() => setHidden(true)}
          >
            隐藏
          </button>
        </div>
      </div>

      <div
        ref={listWrapRef}
        className="path-line-nav__window"
        style={{ height: windowH }}
      >
        <div
          className="path-line-nav__track"
          style={{
            transform: `translate3d(0, ${-offset * ROW_PX}px, 0)`,
          }}
        >
          <LineSidebar
            items={labels}
            activeIndex={focusIndex}
            showIndex
            showMarker
            scaleTick
            accentColor="var(--accent)"
            textColor="var(--ink-faint)"
            markerColor="var(--line-strong)"
            fontSize={0.875}
            itemGap={14}
            markerLength={44}
            markerGap={8}
            maxShift={20}
            proximityRadius={88}
            falloff="smooth"
            tickScale={0.5}
            smoothing={100}
            ariaLabel="圆心到当前的深度路径"
            itemFade={itemFade}
            onItemClick={(index) => {
              const n = list[index];
              if (n) onSelect(n.id);
            }}
          />
        </div>
        <div className="path-line-nav__fade path-line-nav__fade--top" aria-hidden />
        <div className="path-line-nav__fade path-line-nav__fade--bot" aria-hidden />
      </div>
    </div>
  );
}
