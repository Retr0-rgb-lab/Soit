import { useCallback, useMemo } from "react";
import type { OrbitModel } from "../../lib/orbitLayout";
import OptionWheel from "./OptionWheel";
import "./FocusOrbit.css";

export type FocusOrbitProps = {
  model: OrbitModel;
  onSelect: (id: string) => void;
  className?: string;
};

function kindPrefix(kind: string): string {
  if (kind === "deepen") return "↓";
  if (kind === "diverge") return "↗";
  return "";
}

/**
 * Stacked Option Wheels (React Bits model × concentric depth).
 *
 * Visual metaphor (from reactbits Option Wheel + PEL-149):
 * - Each depth level is a full vertical drum picker (blur/fade neighbors, no chips).
 * - Wheels stack top→bottom = inner→outer ring (同心圆的「露出弧」叠在一起).
 * - Hub text = root at the center of decorative circles (not a file-tree row).
 */
export default function FocusOrbit({
  model,
  onSelect,
  className = "",
}: FocusOrbitProps) {
  const ring1 = model.rings[1] ?? [];
  const ring2 = model.rings[2] ?? [];

  const labels1 = useMemo(() => ring1.map((i) => i.title), [ring1]);
  const labels2 = useMemo(() => ring2.map((i) => i.title), [ring2]);
  const prefix1 = useMemo(() => ring1.map((i) => kindPrefix(i.kind)), [ring1]);
  const prefix2 = useMemo(() => ring2.map((i) => kindPrefix(i.kind)), [ring2]);

  const selected1 = useMemo(() => {
    const i = ring1.findIndex((x) => x.id === model.focusId);
    if (i >= 0) return i;
    if (ring2[0]?.parentId) {
      const p = ring1.findIndex((x) => x.id === ring2[0]!.parentId);
      if (p >= 0) return p;
    }
    return Math.max(0, Math.min(labels1.length - 1, 0));
  }, [ring1, ring2, model.focusId, labels1.length]);

  const selected2 = useMemo(() => {
    const i = ring2.findIndex((x) => x.id === model.focusId);
    return i >= 0 ? i : 0;
  }, [ring2, model.focusId]);

  const onRing1 = useCallback(
    (index: number) => {
      const it = ring1[index];
      if (it) onSelect(it.id);
    },
    [onSelect, ring1],
  );

  const onRing2 = useCallback(
    (index: number) => {
      const it = ring2[index];
      if (it) onSelect(it.id);
    },
    [onSelect, ring2],
  );

  if (!model.center && !ring1.length) {
    return (
      <div className={`focus-orbit${className ? ` ${className}` : ""}`}>
        <p className="focus-orbit__empty">无探究</p>
      </div>
    );
  }

  const hub = model.center?.title ?? "—";

  return (
    <div
      className={`focus-orbit focus-orbit--stack${className ? ` ${className}` : ""}`}
      data-focus={model.focusId || undefined}
    >
      {/* Decorative concentric rings + hub (center of circles) */}
      <div className="fo-hub-block">
        <div className="fo-hub-block__rings" aria-hidden>
          <span className="fo-ring fo-ring--a" />
          <span className="fo-ring fo-ring--b" />
          <span className="fo-ring fo-ring--c" />
        </div>
        <button
          type="button"
          className={[
            "fo-hub-text",
            model.center?.id === model.focusId ? "is-focus" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          title={hub}
          aria-label={`根探究 ${hub}`}
          onClick={() => model.center && onSelect(model.center.id)}
        >
          {hub}
        </button>
      </div>

      {/* Stacked option wheels — each = one concentric ring’s exposed arc */}
      {labels1.length > 0 && (
        <section className="fo-layer fo-layer--1" aria-label="内轮">
          <OptionWheel
            items={labels1}
            prefixes={prefix1}
            selected={selected1}
            onChange={onRing1}
            side="left"
            fontSize={1.45}
            spacing={1.4}
            curve={1}
            tilt={5}
            blur={2}
            fade={0.25}
            minOpacity={0.08}
            inset={12}
            smoothing={180}
            draggable
          />
        </section>
      )}

      {labels2.length > 0 && (
        <section className="fo-layer fo-layer--2" aria-label="外轮">
          <OptionWheel
            items={labels2}
            prefixes={prefix2}
            selected={selected2}
            onChange={onRing2}
            side="left"
            fontSize={1.2}
            spacing={1.35}
            curve={0.9}
            tilt={4}
            blur={1.8}
            fade={0.28}
            minOpacity={0.08}
            inset={20}
            smoothing={180}
            draggable
          />
        </section>
      )}
    </div>
  );
}
