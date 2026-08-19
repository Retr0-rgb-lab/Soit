import { useWorkspace } from "../../state/workspaceStore";

export default function RightGraph() {
  const nodes = useWorkspace((s) => s.nodes);
  const focusId = useWorkspace((s) => s.focusId);
  const focusNode = useWorkspace((s) => s.focusNode);

  return (
    <aside className="right-graph" aria-label="graph">
      <p className="shell-label">Graph</p>
      <h2 className="shell-title">节点</h2>
      {nodes.length === 0 ? (
        <div className="graph-box">graph</div>
      ) : (
        <ul className="node-list">
          {nodes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={n.id === focusId ? "on" : ""}
                onClick={() => focusNode(n.id)}
              >
                {n.kind === "root" ? "●" : n.kind === "deepen" ? "↓" : "↗"} {n.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
