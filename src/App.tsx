import { useEffect } from "react";
import AppShell from "./components/shell/AppShell";
import { demoSnapshot } from "./lib/demoSeed";
import { getBootstrapState, getWorkspaceSnapshot } from "./lib/host";
import { useWorkspace } from "./state/workspaceStore";

export default function App() {
  const loadSnapshot = useWorkspace((s) => s.loadSnapshot);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await getBootstrapState();
      const snap = await getWorkspaceSnapshot();
      if (cancelled) return;
      if (snap.nodes.length === 0) loadSnapshot(demoSnapshot());
      else loadSnapshot(snap);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSnapshot]);

  // First paint: shell immediately (even while bootstrap/snapshot pending).
  return <AppShell />;
}
