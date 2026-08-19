import { useWorkspace } from "../../state/workspaceStore";

type Props = {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

export default function LeftRail({ collapsed = false, onToggleCollapse }: Props) {
  const nodes = useWorkspace((s) => s.nodes);
  const focusId = useWorkspace((s) => s.focusId);
  const focusNode = useWorkspace((s) => s.focusNode);

  return (
    <aside
      className={`left-rail${collapsed ? " collapsed" : ""}`}
      aria-label="left rail"
    >
      <div className="rail-head">
        <div className="rail-brand">
          <p className="shell-label">Soit</p>
          {!collapsed && <h2 className="shell-title">探究</h2>}
        </div>
        <button
          type="button"
          className="rail-toggle"
          aria-label={collapsed ? "展开左栏" : "折叠左栏"}
          aria-expanded={!collapsed}
          onClick={onToggleCollapse}
          title={collapsed ? "展开" : "折叠"}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {!collapsed && (
        <>
          <nav className="rail-nav" aria-label="nav placeholders">
            <button type="button" className="rail-nav-item" disabled>
              宇宙
            </button>
            <button type="button" className="rail-nav-item" disabled>
              vault
            </button>
            <button type="button" className="rail-nav-item" disabled>
              记忆
            </button>
            <button type="button" className="rail-nav-item" disabled>
              技能
            </button>
          </nav>

          <p className="rail-section-label">探究列表</p>
          {nodes.length === 0 ? (
            <p className="shell-placeholder">rail</p>
          ) : (
            <ul className="node-list">
              {nodes.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`${n.id === focusId ? "on" : ""} ${n.unread ? "unread" : ""}`.trim()}
                    onClick={() => focusNode(n.id)}
                  >
                    <span className="node-kind" aria-hidden>
                      {n.kind === "root" ? "●" : n.kind === "deepen" ? "↓" : "↗"}
                    </span>
                    {n.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </aside>
  );
}
