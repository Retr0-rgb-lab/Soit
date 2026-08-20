import { useMemo } from "react";
import { buildOrbitModel } from "../../lib/orbitLayout";
import { useWorkspace } from "../../state/workspaceStore";
import FocusOrbit from "./FocusOrbit";

type Props = {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

/**
 * Left rail = stacked Option Wheels only (+ hide).
 * No vault / live list / recent / debt / action chrome.
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

  return (
    <aside
      className={`left-rail left-rail--orbit-only${collapsed ? " collapsed" : ""}`}
      aria-label="探究叠轮"
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
          {orbitModel?.center ? (
            <FocusOrbit model={orbitModel} onSelect={open} />
          ) : (
            <p className="rail-orbit-empty">尚无探究树</p>
          )}
        </div>
      )}
    </aside>
  );
}
