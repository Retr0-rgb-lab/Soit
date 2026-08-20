import { useMemo } from "react";
import { buildOrbitModel } from "../../lib/orbitLayout";
import { useWorkspace } from "../../state/workspaceStore";
import FocusOrbit from "./FocusOrbit";
import PathLineNav from "./PathLineNav";

type Props = {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

/**
 * Left rail = orbit (top) + vertical tree Line Sidebar (bottom, hideable).
 */
export default function LeftRail({
  collapsed = false,
  onToggleCollapse,
}: Props) {
  const nodes = useWorkspace((s) => s.nodes);
  const focusId = useWorkspace((s) => s.focusId);
  const liveIds = useWorkspace((s) => s.liveIds);
  const focusNode = useWorkspace((s) => s.focusNode);
  const setMode = useWorkspace((s) => s.setWorkspaceMode);

  const orbitFocusId = focusId || liveIds[0] || "";
  const orbitModel = useMemo(() => {
    if (!orbitFocusId) return null;
    return buildOrbitModel(nodes, orbitFocusId);
  }, [nodes, orbitFocusId]);

  const open = (id: string) => {
    focusNode(id);
    setMode("focus");
  };

  const openGlobal = () => {
    setMode("map");
  };

  return (
    <aside
      className={`left-rail left-rail--orbit-only${collapsed ? " collapsed" : ""}`}
      aria-label="探究导航"
    >
      <button
        type="button"
        className="rail-toggle"
        aria-label={collapsed ? "显示轨道" : "隐藏轨道"}
        aria-expanded={!collapsed}
        onClick={onToggleCollapse}
        title={collapsed ? "显示轨道 (Ctrl+B)" : "隐藏轨道 (Ctrl+B)"}
      >
        {collapsed ? "›" : "‹"}
      </button>

      {!collapsed && (
        <div className="rail-scroll rail-scroll--orbit">
          {orbitModel?.hub ?? orbitModel?.center ? (
            <>
              <div className="rail-orbit-block">
                <div className="rail-orbit-head">
                  <button
                    type="button"
                    className="rail-orbit-expand"
                    onClick={openGlobal}
                    title="全局视角 (M 或 Ctrl+\\)"
                  >
                    全局视角
                  </button>
                </div>
                <FocusOrbit model={orbitModel} onSelect={open} />
              </div>
              <div className="rail-path-block">
                <PathLineNav
                  nodes={nodes}
                  focusId={orbitFocusId}
                  onSelect={open}
                />
              </div>
            </>
          ) : (
            <p className="rail-orbit-empty">尚无探究树</p>
          )}
        </div>
      )}
    </aside>
  );
}
