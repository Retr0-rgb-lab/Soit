import type { SourceSpan } from "../../types";

interface Props {
  x: number;
  y: number;
  sourceLabel: string;
  /** Richer source span when available (selection / mark). */
  sourceSpan?: Pick<SourceSpan, "turnId" | "markId" | "start" | "end">;
  /** Spec §2.6: no turns on focus card → disable deepen/diverge. */
  disabled?: boolean;
  onDeepen: (label: string, span?: Props["sourceSpan"]) => void;
  onDiverge: (label: string, span?: Props["sourceSpan"]) => void;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

/** Compact deepen / diverge chooser at a point (selection preview path). */
export default function DirectionChooser({
  x,
  y,
  sourceLabel,
  sourceSpan,
  disabled = false,
  onDeepen,
  onDiverge,
}: Props) {
  const left = clamp(x - 20, 8, window.innerWidth - 180);
  const top = clamp(y - 52, 8, window.innerHeight - 60);

  return (
    <div className="ic-chooser" style={{ left, top }} role="menu" aria-label="选择方向">
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          onDeepen(sourceLabel, sourceSpan);
        }}
      >
        深挖
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          onDiverge(sourceLabel, sourceSpan);
        }}
      >
        发散
      </button>
    </div>
  );
}
