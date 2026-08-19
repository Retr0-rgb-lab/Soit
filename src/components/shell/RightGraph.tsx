import { useMemo } from "react";
import { layoutGraph } from "../../lib/graphLayout";
import { useWorkspace } from "../../state/workspaceStore";

export default function RightGraph() {
  const nodes = useWorkspace((s) => s.nodes);
  const focusId = useWorkspace((s) => s.focusId);
  const focusNode = useWorkspace((s) => s.focusNode);

  const laid = useMemo(() => layoutGraph(nodes), [nodes]);
  const byId = useMemo(() => new Map(laid.map((n) => [n.id, n])), [laid]);

  return (
    <aside className="right-graph" aria-label="graph">
      <p className="shell-label">Graph</p>
      <h2 className="shell-title">节点</h2>
      {laid.length === 0 ? (
        <div className="graph-box">graph</div>
      ) : (
        <div className="graph-box graph-svg-wrap" title="点节点换卡">
          <svg
            viewBox="0 0 200 300"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="inquiry graph"
          >
            {laid
              .filter((n) => n.parentId && byId.has(n.parentId))
              .map((n) => {
                const p = byId.get(n.parentId!)!;
                const midY = (p.y + n.y) / 2;
                return (
                  <path
                    key={`e-${n.id}`}
                    className="graph-edge"
                    d={`M${p.x.toFixed(1)} ${p.y.toFixed(1)} C${p.x.toFixed(1)} ${midY.toFixed(1)}, ${n.x.toFixed(1)} ${midY.toFixed(1)}, ${n.x.toFixed(1)} ${n.y.toFixed(1)}`}
                    fill="none"
                  />
                );
              })}
            {laid.map((n) => {
              const on = n.id === focusId;
              const r = on ? 12 : 8.5;
              return (
                <g
                  key={n.id}
                  className={`graph-node${on ? " on" : ""}${n.unread ? " unread" : ""}`}
                  transform={`translate(0,0)`}
                  onClick={() => focusNode(n.id)}
                  style={{ cursor: "pointer" }}
                >
                  <circle className="ring" cx={n.x} cy={n.y} r={r} />
                  <circle
                    className="dot"
                    cx={n.x + r - 1}
                    cy={n.y - r + 1}
                    r={3.2}
                  />
                  <title>{n.title}</title>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </aside>
  );
}
