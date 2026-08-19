import { useEffect, useRef, useState } from "react";

const DELAY_MS = 400;

/**
 * Global tooltip driven by `data-tip` attributes.
 * Fixed layer; opacity transition; ~400ms show delay.
 */
export default function TooltipLayer() {
  const [text, setText] = useState("");
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [on, setOn] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const hide = (immediate = false) => {
      clearTimer();
      setOn(false);
      if (immediate) setText("");
    };

    const onOver = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const el = t.closest("[data-tip]") as HTMLElement | null;
      if (!el) {
        hide();
        return;
      }
      const tip = el.getAttribute("data-tip") || "";
      if (!tip) {
        hide();
        return;
      }
      clearTimer();
      setOn(false);
      timerRef.current = window.setTimeout(() => {
        setText(tip);
        setOn(true);
        // position after paint so we know tip size
        requestAnimationFrame(() => {
          const r = el.getBoundingClientRect();
          const node = tipRef.current;
          const tw = node?.offsetWidth || 120;
          const th = node?.offsetHeight || 28;
          let left = r.left + r.width / 2 - tw / 2;
          let top = r.top - th - 8;
          if (top < 8) top = r.bottom + 8;
          left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
          setPos({ left, top });
        });
      }, DELAY_MS);
    };

    const onOut = (e: MouseEvent) => {
      const related = e.relatedTarget;
      if (related instanceof Element && related.closest("[data-tip]")) return;
      hide();
    };

    const onScroll = () => hide(true);

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      clearTimer();
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  return (
    <div
      ref={tipRef}
      className={`ic-tip${on && text ? " on" : ""}`}
      style={{ left: pos.left, top: pos.top }}
      role="tooltip"
    >
      {text}
    </div>
  );
}
