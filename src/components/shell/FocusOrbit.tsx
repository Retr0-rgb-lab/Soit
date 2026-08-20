import type { OrbitModel } from "../../lib/orbitLayout";
import { kindGlyph } from "../../lib/treeNav";

type Props = {
  model: OrbitModel;
  onSelect: (id: string) => void;
  className?: string;
};

/** Minimal host stub — full side-arc UI lands from pel-149-02. */
export default function FocusOrbit({ model, onSelect, className }: Props) {
  if (!model.center) return null;

  const ring1 = model.rings[1] ?? [];
  const ring2 = model.rings[2] ?? [];

  return (
    <div
      className={`focus-orbit focus-orbit-stub${className ? ` ${className}` : ""}`}
      aria-label="焦点轨道"
    >
      <button
        type="button"
        className={`focus-orbit-center${model.center.id === model.focusId ? " on" : ""}`}
        aria-label="根探究"
        title={model.center.title}
        onClick={() => onSelect(model.center!.id)}
      >
        <span className="node-kind" aria-hidden>
          {kindGlyph(model.center.kind)}
        </span>
        {model.center.title}
      </button>
      {ring1.length > 0 && (
        <ul className="focus-orbit-ring" data-ring="1">
          {ring1.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`focus-orbit-item${item.id === model.focusId ? " on" : ""}${item.unread ? " unread" : ""}`}
                title={item.title}
                onClick={() => onSelect(item.id)}
              >
                <span className="node-kind" aria-hidden>
                  {kindGlyph(item.kind)}
                </span>
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      )}
      {ring2.length > 0 && (
        <ul className="focus-orbit-ring faint" data-ring="2">
          {ring2.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`focus-orbit-item${item.id === model.focusId ? " on" : ""}${item.unread ? " unread" : ""}`}
                title={item.title}
                onClick={() => onSelect(item.id)}
              >
                <span className="node-kind" aria-hidden>
                  {kindGlyph(item.kind)}
                </span>
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
