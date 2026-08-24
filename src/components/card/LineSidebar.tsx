import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type CSSProperties,
} from "react";
import "./LineSidebar.css";

type Falloff = "linear" | "smooth" | "sharp";

export interface LineSidebarProps {
  items?: string[];
  accentColor?: string;
  textColor?: string;
  markerColor?: string;
  showIndex?: boolean;
  showMarker?: boolean;
  proximityRadius?: number;
  maxShift?: number;
  falloff?: Falloff;
  markerLength?: number;
  markerGap?: number;
  tickScale?: number;
  scaleTick?: boolean;
  itemGap?: number;
  fontSize?: number;
  smoothing?: number;
  defaultActive?: number | null;
  /** Controlled active index (overrides internal click state when set). */
  activeIndex?: number | null;
  onItemClick?: (index: number, label: string) => void;
  className?: string;
  /** Accessible name (default: 导航) */
  ariaLabel?: string;
  /**
   * Optional per-index opacity (0–1). Used by path window fade.
   * When omitted, all items are fully opaque (proximity still applies).
   */
  itemFade?: (index: number) => number;
}

const FALLOFF_CURVES: Record<Falloff, (p: number) => number> = {
  linear: (p) => p,
  smooth: (p) => p * p * (3 - 2 * p),
  sharp: (p) => p * p * p,
};

const DEFAULT_ITEMS = [
  "Overview",
  "Components",
  "Animations",
  "Backgrounds",
  "Showcase",
  "Playground",
  "Templates",
  "Changelog",
];

/**
 * React Bits — Line Sidebar (proximity-reactive vertical nav).
 * @see https://reactbits.dev/components/line-sidebar
 */
export default function LineSidebar({
  items = DEFAULT_ITEMS,
  accentColor = "#8b5e34",
  textColor = "#8a8074",
  markerColor = "#c4b7a4",
  showIndex = true,
  showMarker = true,
  proximityRadius = 100,
  maxShift = 18,
  falloff = "smooth",
  markerLength = 40,
  markerGap = 6,
  tickScale = 0.5,
  scaleTick = true,
  itemGap = 16,
  fontSize = 0.8125,
  smoothing = 100,
  defaultActive = null,
  activeIndex: activeIndexProp,
  onItemClick,
  className = "",
  ariaLabel = "导航",
  itemFade,
}: LineSidebarProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const targetsRef = useRef<number[]>([]);
  const currentRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const activeRef = useRef<number | null>(defaultActive);
  const smoothingRef = useRef(smoothing);
  const [activeInternal, setActiveInternal] = useState<number | null>(
    defaultActive,
  );

  const activeIndex =
    activeIndexProp !== undefined ? activeIndexProp : activeInternal;

  activeRef.current = activeIndex;
  smoothingRef.current = smoothing;

  const runFrame = useCallback((now: number) => {
    const dt = Math.min((now - lastRef.current) / 1000, 0.05);
    lastRef.current = now;
    const tau = Math.max(smoothingRef.current, 1) / 1000;
    const k = 1 - Math.exp(-dt / tau);

    let moving = false;
    const els = itemRefs.current;
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (!el) continue;
      const target = Math.max(
        targetsRef.current[i] || 0,
        activeRef.current === i ? 1 : 0,
      );
      const cur = currentRef.current[i] || 0;
      const next = cur + (target - cur) * k;
      const settled = Math.abs(target - next) < 0.0015;
      const value = settled ? target : next;
      currentRef.current[i] = value;
      el.style.setProperty("--effect", value.toFixed(4));
      if (!settled) moving = true;
    }

    rafRef.current = moving ? requestAnimationFrame(runFrame) : null;
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
    }
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLUListElement>) => {
      const list = listRef.current;
      if (!list) return;
      const rect = list.getBoundingClientRect();
      const pointerY = e.clientY - rect.top + list.scrollTop;
      const ease = FALLOFF_CURVES[falloff] ?? FALLOFF_CURVES.linear;
      const els = itemRefs.current;
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        if (!el) continue;
        const center = el.offsetTop + el.offsetHeight / 2;
        const distance = Math.abs(pointerY - center);
        targetsRef.current[i] = ease(
          Math.max(0, 1 - distance / proximityRadius),
        );
      }
      startLoop();
    },
    [falloff, proximityRadius, startLoop],
  );

  const handlePointerLeave = useCallback(() => {
    targetsRef.current = targetsRef.current.map(() => 0);
    startLoop();
  }, [startLoop]);

  const handleClick = useCallback(
    (index: number, label: string) => {
      if (activeIndexProp === undefined) {
        setActiveInternal(index);
      }
      onItemClick?.(index, label);
    },
    [onItemClick, activeIndexProp],
  );

  // Keep internal state in sync when controlled or default changes
  useEffect(() => {
    if (activeIndexProp !== undefined) return;
    if (defaultActive != null) setActiveInternal(defaultActive);
  }, [defaultActive, activeIndexProp]);

  useEffect(() => {
    startLoop();
  }, [activeIndex, startLoop, items.length]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    },
    [],
  );

  // Wheel scroll stays on the list (do not bubble to page)
  const handleWheel = useCallback((e: React.WheelEvent<HTMLUListElement>) => {
    const list = listRef.current;
    if (!list) return;
    if (list.scrollHeight <= list.clientHeight) return;
    e.stopPropagation();
    list.scrollTop += e.deltaY;
  }, []);

  return (
    <nav
      className={`line-sidebar${showMarker ? " line-sidebar--markers" : ""}${scaleTick ? " line-sidebar--scale-tick" : ""}${className ? ` ${className}` : ""}`}
      style={
        {
          "--accent-color": accentColor,
          "--text-color": textColor,
          "--marker-color": markerColor,
          "--marker-length": `${markerLength}px`,
          "--marker-gap": `${markerGap}px`,
          "--tick-scale": tickScale,
          "--max-shift": `${maxShift}px`,
          "--item-gap": `${itemGap}px`,
          "--font-size": `${fontSize}rem`,
          "--smoothing": `${smoothing}ms`,
        } as CSSProperties
      }
      aria-label={ariaLabel}
    >
      <ul
        ref={listRef}
        className="line-sidebar__list"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
      >
        {items.map((label, index) => (
          <li
            key={`${label}-${index}`}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            className="line-sidebar__item"
            aria-current={activeIndex === index ? "true" : undefined}
            style={
              itemFade
                ? ({
                    opacity: itemFade(index),
                    ["--item-fade" as string]: String(itemFade(index)),
                  } as CSSProperties)
                : undefined
            }
            onClick={() => handleClick(index, label)}
          >
            {showMarker && (
              <span className="line-sidebar__marker" aria-hidden="true" />
            )}
            <span className="line-sidebar__label">
              {showIndex && (
                <span className="line-sidebar__index">
                  {String(index + 1).padStart(2, "0")}
                </span>
              )}
              <span className="line-sidebar__text">{label}</span>
            </span>
          </li>
        ))}
      </ul>
    </nav>
  );
}
