import { useEffect } from "react";
import AppShell from "./components/shell/AppShell";
import { demoSnapshot } from "./lib/demoSeed";
import { getBootstrapState, getWorkspaceSnapshot } from "./lib/host";
import { useWorkspace } from "./state/workspaceStore";

/**
 * Load matrix (Spec v1.1):
 * - source === "demo"  → may fill frontend demo seed (never write disk)
 * - source === "empty" → keep empty; no silent demo
 * - source === "universe" → host DB snapshot as-is
 */
export default function App() {
  const loadSnapshot = useWorkspace((s) => s.loadSnapshot);
  const setVaultPath = useWorkspace((s) => s.setVaultPath);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const boot = await getBootstrapState();
      if (cancelled) return;
      setVaultPath(boot.vault);

      const snap = await getWorkspaceSnapshot();
      if (cancelled) return;

      if (snap.source === "demo") {
        loadSnapshot(
          snap.nodes.length > 0 ? snap : demoSnapshot(),
        );
      } else {
        // empty | universe — never inject demo
        loadSnapshot(snap);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSnapshot, setVaultPath]);

  // First paint: shell immediately (even while bootstrap/snapshot pending).
  return <AppShell />;
}
