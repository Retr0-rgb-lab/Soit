import { useState } from "react";
import InquiryCard from "../card/InquiryCard";
import LeftRail from "./LeftRail";
import RightGraph from "./RightGraph";

export default function AppShell() {
  const [railCollapsed, setRailCollapsed] = useState(false);

  return (
    <div className={`app-shell${railCollapsed ? " rail-collapsed" : ""}`}>
      <LeftRail
        collapsed={railCollapsed}
        onToggleCollapse={() => setRailCollapsed((v) => !v)}
      />
      <main className="center-stage" aria-label="inquiry card">
        <InquiryCard />
      </main>
      <RightGraph />
    </div>
  );
}
