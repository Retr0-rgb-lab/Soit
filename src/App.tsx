import { useEffect } from "react";
import AppShell from "./components/shell/AppShell";
import WorkspacePicker from "./components/shell/WorkspacePicker";
import { unboundEmptySnapshot } from "./lib/demoSeed";
import {
  closeUniverse,
  getBootstrapState,
  getSessionConfig,
} from "./lib/host";
import { emptySessionConfig } from "./lib/sessionConfig";
import { useWorkspace } from "./state/workspaceStore";

/**
 * Cold start (workspace-hall §2.4):
 * - Default shellPhase = picker → first paint is hall, not AppShell flash
 * - close if Host already bound; getSessionConfig for last+recents
 * - never silent openUniverse(lastVault)
 * - unbound empty snapshot (no product demo cards)
 */
export default function App() {
  const loadSnapshot = useWorkspace((s) => s.loadSnapshot);
  const setVaultPath = useWorkspace((s) => s.setVaultPath);
  const beginBootLoad = useWorkspace((s) => s.beginBootLoad);
  const shellPhase = useWorkspace((s) => s.shellPhase);

  useEffect(() => {
    let cancelled = false;
    const epoch = beginBootLoad();

    (async () => {
      let bootError: string | null = null;

      try {
        const boot = await getBootstrapState();
        if (cancelled) return;

        // Host already bound (rare cold start) → close before hall.
        if (boot.vault) {
          try {
            await closeUniverse();
          } catch (e) {
            bootError =
              (e instanceof Error ? e.message : String(e)).trim() ||
              "关闭已打开的库失败";
          }
        }
      } catch {
        /* bootstrap probe failed — stay on hall */
      }
      if (cancelled) return;

      let session = emptySessionConfig();
      try {
        session = await getSessionConfig();
      } catch {
        session = emptySessionConfig();
      }
      if (cancelled) return;

      // Unbound empty graph; no open lastVault.
      setVaultPath(null);
      loadSnapshot(unboundEmptySnapshot(), epoch);
      if (cancelled) return;

      useWorkspace.setState({
        sessionConfig: session,
        vaultPath: null,
        enterError: bootError,
        shellPhase: bootError ? "error" : "picker",
        spaceBusy: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [beginBootLoad, loadSnapshot, setVaultPath]);

  const showHall =
    shellPhase === "picker" ||
    shellPhase === "entering" ||
    shellPhase === "error";

  if (showHall) {
    return <WorkspacePicker />;
  }

  return <AppShell />;
}
