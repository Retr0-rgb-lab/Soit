import {
  useCallback,
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

/**
 * Card | sash | DocPane host. Owns `--doc-fraction` (materials-rail SPE §2.6).
 * Stored ratio only under split; doc-wide shows DOC_WIDE_FRACTION until drag.
 */
export default function WorkspaceSplit({
  layout,
  card,
  doc,
}: {
  layout: SplitLayout;
  card: ReactNode;
  doc: ReactNode;
}) {
  const setDocLayout = useWorkspace((s) => s.setDocLayout);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const [storedFrac, setStoredFrac] = useState(readStoredDocFraction);
  const [dragging, setDragging] = useState(false);

  // doc-wide: display-only 0.68 (no storage write). Drag uses storedFrac path.
  const displayFrac =
    layout === "doc-wide" && !dragging ? DOC_WIDE_FRACTION : storedFrac;

  const fractionFromClientX = useCallback((clientX: number): number => {
    const el = splitRef.current;
    if (!el) return storedFrac;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return storedFrac;
    // Doc is on the right: fraction = remaining width to the right of pointer.
    return clampDocFraction((r.right - clientX) / r.width);
  }, [storedFrac]);

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
      if (e.button !== 0) return;
      e.preventDefault();
      const target = e.currentTarget;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setDragging(true);
      // First move of a drag in doc-wide exits wide and starts from pointer.
      const f = fractionFromClientX(e.clientX);
      commitFraction(f, { exitWide: true });
    },
    [commitFraction, fractionFromClientX],
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
    setDragging(false);
    setStoredFrac(DOC_FRACTION_DEFAULT);
    writeStoredDocFraction(DOC_FRACTION_DEFAULT);
    if (layout !== "split") setDocLayout("split");
  }, [layout, setDocLayout]);

  const style = {
    ["--doc-fraction" as string]: String(displayFrac),
  } as CSSProperties;

  return (
    <div
      ref={splitRef}
      className={`workspace-split${layout === "doc-wide" ? " is-doc-wide" : ""}${dragging ? " is-splitting" : ""}`}
      style={style}
      aria-label="card and document"
    >
      {card}
      <div
        className={`split-sash${dragging ? " is-dragging" : ""}`}
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={28}
        aria-valuemax={72}
        aria-valuenow={Math.round(displayFrac * 100)}
        aria-label="调整文档栏宽度"
        title="拖动调整宽度 · 双击恢复默认"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
      />
      {doc}
    </div>
  );
}
