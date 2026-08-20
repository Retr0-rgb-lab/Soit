import { useEffect } from "react";
import AppShell from "./components/shell/AppShell";
import { demoSnapshot } from "./lib/demoSeed";
import {
  getBootstrapState,
  getWorkspaceSnapshot,
  openUniverse,
} from "./lib/host";
import { useWorkspace } from "./state/workspaceStore";

/**
 * Load matrix (Spec v1.1):
 * - source === "demo"  → may fill frontend demo seed (never write disk)
 * - source === "empty" → keep empty; no silent demo
 * - source === "universe" → host DB snapshot as-is
 *
 * Boot epoch (Spec §6.3): stale bootstrap/open/snapshot must not overwrite
 * a newer loadSnapshot after the user binds another vault.
 * Uses store `beginBootLoad` + `loadSnapshot(snap, epoch)`.
 */
export default function App() {
  const loadSnapshot = useWorkspace((s) => s.loadSnapshot);
  const setVaultPath = useWorkspace((s) => s.setVaultPath);
  const beginBootLoad = useWorkspace((s) => s.beginBootLoad);

  useEffect(() => {
    let cancelled = false;
    const epoch = beginBootLoad();

    const isStale = () => cancelled;

    (async () => {
      const boot = await getBootstrapState();
      if (isStale()) return;

      // Currently open vault (usually null on cold start).
      if (boot.vault) {
        setVaultPath(boot.vault);
      }

      // H4: restore lastVault via explicit open — never open DB in bootstrap.
      // Failure → stay unbound / demo matrix; do not crash.
      const last = boot.lastVault?.trim() || null;
      if (!boot.vault && last) {
        try {
          const res = await openUniverse(last);
          if (isStale()) return;
          if (res.ok && res.snapshot) {
            setVaultPath(res.path);
            loadSnapshot(res.snapshot, epoch);
            return;
          }
          // open failed — fall through to unbound snapshot
        } catch {
          if (isStale()) return;
        }
      }

      const snap = await getWorkspaceSnapshot();
      if (isStale()) return;

      if (snap.source === "demo") {
        loadSnapshot(
          snap.nodes.length > 0 ? snap : demoSnapshot(),
          epoch,
        );
      } else {
        // empty | universe — never inject demo
        if (boot.vault) setVaultPath(boot.vault);
        loadSnapshot(snap, epoch);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [beginBootLoad, loadSnapshot, setVaultPath]);

  // First paint: shell immediately (even while bootstrap/snapshot pending).
  return <AppShell />;
}
