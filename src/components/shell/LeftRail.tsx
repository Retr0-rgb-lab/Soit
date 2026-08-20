import { useMemo } from "react";
import { buildOrbitModel } from "../../lib/orbitLayout";
import { useWorkspace } from "../../state/workspaceStore";
import FocusOrbit from "./FocusOrbit";
import PathLineNav from "./PathLineNav";

type Props = {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

function vaultLeaf(path: string | null): string {
  if (!path) return "未绑定";
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? path;
}

/**
 * Left rail = vault strip (leaf + leave) + orbit (top) + path tree (bottom).
 * Leave → store.leave() only (workspace-hall §2.5).
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
  const vaultPath = useWorkspace((s) => s.vaultPath);
  const leave = useWorkspace((s) => s.leave);
  const spaceBusy = useWorkspace((s) => s.spaceBusy);
  const shellPhase = useWorkspace((s) => s.shellPhase);
  const enterError = useWorkspace((s) => s.enterError);

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

  const leaveBusy =
    spaceBusy || shellPhase === "entering" || shellPhase === "leaving";
  const leaf = vaultLeaf(vaultPath);

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
          <div className="rail-vault compact" aria-label="当前工作区">
            <span className="rail-vault-kicker">本库</span>
            <p className="rail-vault-name" title={vaultPath ?? undefined}>
              {leaf}
            </p>
            <div className="rail-vault-actions">
              <button
                type="button"
                className="rail-action ghost"
                disabled={leaveBusy || !vaultPath}
                onClick={() => void leave()}
                title="退出工作区，返回门厅"
              >
                {shellPhase === "leaving" ? "退出中…" : "退出工作区"}
              </button>
            </div>
            {enterError ? (
              <p className="rail-vault-error" role="alert">
                {enterError}
              </p>
            ) : null}
          </div>

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
