import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  DOC_FRACTION_DEFAULT,
  DOC_WIDE_FRACTION,
  clampDocFraction,
  readStoredDocFraction,
  writeStoredDocFraction,
} from "../../lib/splitRatio";
import { useWorkspace } from "../../state/workspaceStore";

export type SplitLayout = "split" | "doc-wide";

/** Open/close duration — keep in sync with CSS `--companion-ms`. */
export const COMPANION_ANIM_MS = 300;

/**
 * Card | sash | companion host. Owns `--doc-fraction`.
 * `expanded` drives open/close width animation (shell delays unmount on close).
 */
export default function WorkspaceSplit({
  layout,
  card,
  doc,
  expanded = true,
}: {
  layout: SplitLayout;
  card: ReactNode;
  doc: ReactNode;
  /** false = animate companion to 0 width (still mounted). */
  expanded?: boolean;
}) {
  const setDocLayout = useWorkspace((s) => s.setDocLayout);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const [storedFrac, setStoredFrac] = useState(readStoredDocFraction);
  const [dragging, setDragging] = useState(false);
  const [splitW, setSplitW] = useState(0);

  const displayFrac =
    layout === "doc-wide" && !dragging ? DOC_WIDE_FRACTION : storedFrac;

  useEffect(() => {
    const el = splitRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setSplitW(w);
    });
    ro.observe(el);
    setSplitW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const fractionFromClientX = useCallback(
    (clientX: number): number => {
      const el = splitRef.current;
      if (!el) return storedFrac;
      const r = el.getBoundingClientRect();
      if (r.width <= 0) return storedFrac;
      return clampDocFraction((r.right - clientX) / r.width);
    },
    [storedFrac],
  );

  const commitFraction = useCallback(
    (raw: number, opts?: { exitWide?: boolean }) => {
      const f = clampDocFraction(raw);
      setStoredFrac(f);
      writeStoredDocFraction(f);
      if (opts?.exitWide && layout === "doc-wide") {
        setDocLayout("split");
      }
    },
    [layout, setDocLayout],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || !expanded) return;
      e.preventDefault();
      const target = e.currentTarget;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setDragging(true);
      const f = fractionFromClientX(e.clientX);
      commitFraction(f, { exitWide: true });
    },
    [commitFraction, expanded, fractionFromClientX],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      if (!(e.buttons & 1) && e.pressure === 0) return;
      commitFraction(fractionFromClientX(e.clientX), { exitWide: true });
    },
    [dragging, commitFraction, fractionFromClientX],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      commitFraction(fractionFromClientX(e.clientX), { exitWide: true });
      setDragging(false);
    },
    [dragging, commitFraction, fractionFromClientX],
  );

  const onDoubleClick = useCallback(() => {
    if (!expanded) return;
    setDragging(false);
    setStoredFrac(DOC_FRACTION_DEFAULT);
    writeStoredDocFraction(DOC_FRACTION_DEFAULT);
    if (layout !== "split") setDocLayout("split");
  }, [expanded, layout, setDocLayout]);

  const companionPx =
    splitW > 0 ? Math.round(splitW * displayFrac) : Math.round(420 * displayFrac);

  const style = {
    ["--doc-fraction" as string]: String(displayFrac),
    ["--companion-w" as string]: expanded ? `${companionPx}px` : "0px",
    ["--companion-inner-w" as string]: `${Math.max(companionPx, 280)}px`,
  } as CSSProperties;

  return (
    <div
      ref={splitRef}
      className={`workspace-split${layout === "doc-wide" ? " is-doc-wide" : ""}${dragging ? " is-splitting" : ""}${expanded ? " is-companion-open" : " is-companion-closing"}`}
      style={style}
      aria-label="card and document"
      data-companion={expanded ? "open" : "closing"}
    >
      {card}
      <div
        className={`split-sash${dragging ? " is-dragging" : ""}${expanded ? "" : " is-collapsed"}`}
        role="separator"
        aria-orientation="vertical"
        aria-hidden={!expanded}
        aria-valuemin={28}
        aria-valuemax={72}
        aria-valuenow={Math.round(displayFrac * 100)}
        aria-label="调整文档栏宽度"
        title="拖动调整宽度 · 双击恢复默认"
        tabIndex={expanded ? 0 : -1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
      />
      <div className="companion-slot">
        <div className="companion-slot__inner">{doc}</div>
      </div>
    </div>
  );
}
