import { useEffect, useMemo, useRef, useState } from "react";
import { buildOrbitModel } from "../../lib/orbitLayout";
import { useWorkspace } from "../../state/workspaceStore";
import FocusOrbit from "./FocusOrbit";
import "./OrbitStage.css";

type Props = {
  onClose: () => void;
  /** Select node and leave global orbit view. */
  onPick: (id: string) => void;
};

/**
 * Global view of the left FocusOrbit circle on app paper.
 * Full-viewport canvas (no side gutters); Obsidian-like pan/zoom.
 */
export default function OrbitStage({ onClose, onPick }: Props) {
  const nodes = useWorkspace((s) => s.nodes);
  const focusId = useWorkspace((s) => s.focusId);
  const liveIds = useWorkspace((s) => s.liveIds);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ w: 800, h: 600 });

  const orbitFocusId = focusId || liveIds[0] || "";
  const model = useMemo(() => {
    if (!orbitFocusId) return null;
    return buildOrbitModel(nodes, orbitFocusId);
  }, [nodes, orbitFocusId]);

  // Canvas = entire body (full main area), not a centered square
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.max(320, el.clientWidth);
      const h = Math.max(280, el.clientHeight);
      setViewport((prev) =>
        prev.w === w && prev.h === h ? prev : { w, h },
      );
    };
    measure();
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <main className="orbit-stage" aria-label="全局探究图">
      <header className="orbit-stage__head">
        <div className="orbit-stage__titles">
          <h2 className="orbit-stage__title">全局视角</h2>
          <p className="orbit-stage__hint">
            拖动平移 · 滚轮缩放 · 点击节点回到卡片 · Esc 返回
          </p>
        </div>
        <button
          type="button"
          className="orbit-stage__close"
          onClick={onClose}
          aria-label="退出全局视角"
        >
          返回卡片
        </button>
      </header>
      {/* Full remaining viewport — graph may pan across the whole screen */}
      <div className="orbit-stage__body" ref={bodyRef}>
        {model?.hub || model?.center ? (
          <FocusOrbit
            model={model}
            stageWidth={viewport.w}
            stageHeight={viewport.h}
            panZoom
            className="focus-orbit--global"
            onSelect={onPick}
          />
        ) : (
          <p className="orbit-stage__empty">尚无探究树</p>
        )}
      </div>
    </main>
  );
}
