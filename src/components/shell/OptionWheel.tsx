import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import "./OptionWheel.css";

export type OptionWheelProps = {
  items: string[];
  /** Controlled selected index */
  selected?: number;
  defaultSelected?: number;
  onChange?: (index: number, item: string) => void;
  textColor?: string;
  activeColor?: string;
  /** Edge the wheel curves around */
  side?: "left" | "right";
  /** Label size in rem */
  fontSize?: number;
  /** Vertical gap as multiple of font size */
  spacing?: number;
  /** Curve depth 0 = flat list */
  curve?: number;
  /** Degrees between neighbors */
  tilt?: number;
  /** Blur px added per step from center */
  blur?: number;
  /** Opacity lost per step */
  fade?: number;
  minOpacity?: number;
  /** Easing time constant ms */
  smoothing?: number;
  /** Padding from anchored edge to active item */
  inset?: number;
  loop?: boolean;
  draggable?: boolean;
  className?: string;
  /** Extra meta per item (kind glyph etc.) — rendered before label, no chrome */
  prefixes?: string[];
};

/**
 * React Bits–style Option Wheel: vertical drum picker.
 * Pure text — no chips/backgrounds. Active = sharp; neighbors blur + fade on a curve.
 * @see https://reactbits.dev/components/option-wheel
 */
export default function OptionWheel({
  items,
  selected: selectedProp,
  defaultSelected = 0,
  onChange,
  textColor = "var(--ink-faint)",
  activeColor = "var(--ink)",
  side = "left",
  fontSize = 1.35,
  spacing = 1.45,
  curve = 1,
  tilt = 5,
  blur = 2,
  fade = 0.25,
  minOpacity = 0.08,
  smoothing = 180,
  inset = 28,
  loop = false,
  draggable = true,
  className = "",
  prefixes,
}: OptionWheelProps) {
  const n = items.length;
  const [internal, setInternal] = useState(
    Math.max(0, Math.min(defaultSelected, Math.max(0, n - 1))),
  );
  const selected =
    selectedProp !== undefined
      ? Math.max(0, Math.min(selectedProp, Math.max(0, n - 1)))
      : internal;

  const indexRef = useRef(selected);
  const displayRef = useRef(selected); // float for smooth scroll
  const targetsY = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTs = useRef(0);
  const dragRef = useRef<{ y: number; start: number } | null>(null);
  const itemEls = useRef<(HTMLButtonElement | null)[]>([]);
  const [, bump] = useState(0); // re-render after rAF settles selection

  indexRef.current = selected;

  const commit = useCallback(
    (idx: number) => {
      const i = loop
        ? ((idx % n) + n) % n
        : Math.max(0, Math.min(n - 1, idx));
      if (selectedProp === undefined) setInternal(i);
      if (i !== indexRef.current) {
        onChange?.(i, items[i]!);
      }
      indexRef.current = i;
      bump((x) => x + 1);
    },
    [items, loop, n, onChange, selectedProp],
  );

  const applyTransforms = useCallback(
    (center: number) => {
      const stepPx = fontSize * 16 * spacing;
      for (let i = 0; i < n; i++) {
        const el = itemEls.current[i];
        if (!el) continue;
        let d = i - center;
        if (loop && n > 0) {
          // shortest wrapped distance
          if (d > n / 2) d -= n;
          if (d < -n / 2) d += n;
        }
        const ad = Math.abs(d);
        const y = d * stepPx;
        // curve: push away from anchor edge as |d| grows (circular slice)
        const curveX =
          curve * stepPx * 0.55 * (1 - Math.cos((Math.min(ad, 3) / 3) * Math.PI * 0.5));
        const x = (side === "left" ? 1 : -1) * curveX;
        const rot = (side === "left" ? 1 : -1) * d * tilt;
        const op = Math.max(minOpacity, 1 - ad * fade);
        const bl = ad * blur;
        const fw = ad < 0.35 ? 550 : 300;

        el.style.transform = `translate3d(${x}px, calc(-50% + ${y}px), 0) rotate(${rot}deg)`;
        el.style.opacity = String(op);
        el.style.filter = bl > 0.05 ? `blur(${bl}px)` : "none";
        el.style.fontWeight = String(fw);
        el.style.color = ad < 0.5 ? activeColor : textColor;
        el.style.zIndex = String(100 - Math.round(ad * 10));
        el.setAttribute("aria-selected", ad < 0.5 ? "true" : "false");
      }
    },
    [
      activeColor,
      blur,
      curve,
      fade,
      fontSize,
      loop,
      minOpacity,
      n,
      side,
      spacing,
      textColor,
      tilt,
    ],
  );

  const tick = useCallback(
    (now: number) => {
      const dt = Math.min((now - lastTs.current) / 1000, 0.05);
      lastTs.current = now;
      const tau = Math.max(smoothing, 1) / 1000;
      const k = 1 - Math.exp(-dt / tau);
      const cur = displayRef.current;
      const target = indexRef.current + targetsY.current;
      const next = cur + (target - cur) * k;
      displayRef.current = next;
      applyTransforms(next);

      const settled =
        Math.abs(target - next) < 0.002 && Math.abs(targetsY.current) < 0.001;
      if (settled) {
        displayRef.current = indexRef.current;
        targetsY.current = 0;
        applyTransforms(indexRef.current);
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [applyTransforms, smoothing],
  );

  const startLoop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    lastTs.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  useEffect(() => {
    displayRef.current = selected;
    applyTransforms(selected);
  }, [selected, applyTransforms, n]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const nudge = (delta: number) => {
    const next = indexRef.current + delta;
    if (!loop && (next < 0 || next >= n)) return;
    commit(next);
    startLoop();
  };

  const onWheel = (e: ReactWheelEvent) => {
    if (n <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    const d = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    if (Math.abs(d) < 0.5) return;
    nudge(d > 0 ? 1 : -1);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!draggable || n <= 1) return;
    dragRef.current = { y: e.clientY, start: indexRef.current };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    const stepPx = fontSize * 16 * spacing;
    const dy = e.clientY - dragRef.current.y;
    const raw = dragRef.current.start - dy / stepPx;
    displayRef.current = raw;
    applyTransforms(raw);
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    const stepPx = fontSize * 16 * spacing;
    const dy = e.clientY - dragRef.current.y;
    const raw = dragRef.current.start - dy / stepPx;
    dragRef.current = null;
    commit(Math.round(raw));
    startLoop();
  };

  if (n === 0) return null;

  const height = fontSize * 16 * spacing * 5.2;

  return (
    <div
      className={`option-wheel option-wheel--${side}${className ? ` ${className}` : ""}`}
      style={
        {
          "--ow-font": `${fontSize}rem`,
          "--ow-inset": `${inset}px`,
          "--ow-height": `${height}px`,
          "--ow-text": textColor,
          "--ow-active": activeColor,
        } as CSSProperties
      }
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="listbox"
      aria-label="选项轮"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") {
          e.preventDefault();
          nudge(1);
        } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
          e.preventDefault();
          nudge(-1);
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onChange?.(selected, items[selected]!);
        }
      }}
    >
      <div className="option-wheel__viewport">
        {items.map((label, i) => (
          <button
            key={`${label}-${i}`}
            type="button"
            role="option"
            tabIndex={-1}
            ref={(el) => {
              itemEls.current[i] = el;
            }}
            className="option-wheel__item"
            onClick={() => {
              commit(i);
              startLoop();
            }}
          >
            {prefixes?.[i] ? (
              <span className="option-wheel__prefix" aria-hidden>
                {prefixes[i]}
              </span>
            ) : null}
            <span className="option-wheel__text">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
