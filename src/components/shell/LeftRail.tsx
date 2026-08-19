import { useWorkspace } from "../../state/workspaceStore";

export default function LeftRail() {
  const nodes = useWorkspace((s) => s.nodes);
  const focusId = useWorkspace((s) => s.focusId);
  const focusNode = useWorkspace((s) => s.focusNode);

  return (
    <aside className="left-rail" aria-label="left rail">
      <p className="shell-label">Soit</p>
      <h2 className="shell-title">探究</h2>
      <div className="rail-block">宇宙 · vault · 记忆 · 技能（占位）</div>
      {nodes.length === 0 ? (
        <p className="shell-placeholder">rail</p>
      ) : (
        <ul className="node-list">
          {nodes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={`${n.id === focusId ? "on" : ""} ${n.unread ? "unread" : ""}`}
                onClick={() => focusNode(n.id)}
              >
                {n.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
