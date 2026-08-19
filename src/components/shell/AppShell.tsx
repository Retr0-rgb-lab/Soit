import InquiryCard from "../card/InquiryCard";
import LeftRail from "./LeftRail";
import RightGraph from "./RightGraph";

export default function AppShell() {
  return (
    <div className="app-shell">
      <LeftRail />
      <main className="center-stage" aria-label="inquiry card">
        <InquiryCard />
      </main>
      <RightGraph />
    </div>
  );
}
