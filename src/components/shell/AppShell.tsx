import { useState } from "react";
import { useWorkspace } from "../../state/workspaceStore";
import LeftRail from "./LeftRail";
import RightGraph from "./RightGraph";

export default function AppShell() {
  const [railCollapsed, setRailCollapsed] = useState(false);
  const nodes = useWorkspace((s) => s.nodes);
  const focusId = useWorkspace((s) => s.focusId);
  const source = useWorkspace((s) => s.source);
  const turnsByCardId = useWorkspace((s) => s.turnsByCardId);
  const focus = nodes.find((n) => n.id === focusId);
  const turns = focusId ? (turnsByCardId[focusId] ?? []) : [];

  return (
    <div className={`app-shell${railCollapsed ? " rail-collapsed" : ""}`}>
      <LeftRail
        collapsed={railCollapsed}
        onToggleCollapse={() => setRailCollapsed((c) => !c)}
      />
      <main className="center-stage" aria-label="inquiry card">
        <p className="shell-label">Card</p>
        <div className="shell-card">
          <h1 className="shell-title">{focus?.title ?? "Soit"}</h1>
          <p className="shell-meta">
            {source ? `source: ${source}` : "loading…"}
            {focus ? ` · ${focus.kind}` : ""}
            {turns.length ? ` · ${turns.length} turn(s)` : ""}
          </p>
          <p className="shell-placeholder">
            中栏 InquiryCard 将在后续 wave 接入。当前为可点三栏壳 + demo 状态。
          </p>
        </div>
      </main>
      <RightGraph />
    </div>
  );
}
