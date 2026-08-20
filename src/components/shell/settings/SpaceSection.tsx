import { useEffect, useState } from "react";
import { getSessionConfig, setLastVault } from "../../../lib/host";
import { useWorkspace } from "../../../state/workspaceStore";

type Props = {
  /** When true (settings space tab visible), keep lastVault display fresh. */
  active?: boolean;
};

function vaultLeaf(path: string | null): string | null {
  if (!path) return null;
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? path;
}

/**
 * Settings · 空间 — steward only: path, badge, switch, clear last, leave.
 * Open/leave/switch go through store spaceNav (workspace-hall §2.5 §2.6).
 * No private openUniverse / closeUniverse success path.
 */
export default function SpaceSection({ active = true }: Props) {
  const vaultPath = useWorkspace((s) => s.vaultPath);
  const source = useWorkspace((s) => s.source);
  const sessionConfig = useWorkspace((s) => s.sessionConfig);
  const spaceBusy = useWorkspace((s) => s.spaceBusy);
  const shellPhase = useWorkspace((s) => s.shellPhase);
  const enterError = useWorkspace((s) => s.enterError);
  const leave = useWorkspace((s) => s.leave);
  const switchVault = useWorkspace((s) => s.switch);

  const lastVault = sessionConfig?.lastVault ?? null;

  const [pathInput, setPathInput] = useState(vaultPath ?? "");
  const [clearBusy, setClearBusy] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const navBusy =
    spaceBusy || shellPhase === "entering" || shellPhase === "leaving";
  const busy = navBusy || clearBusy;

  useEffect(() => {
    if (!active) return;
    // sessionConfig is store mirror; refresh if missing while panel open.
    if (sessionConfig != null) return;
    let cancelled = false;
    void (async () => {
      try {
        const session = await getSessionConfig();
        if (!cancelled) {
          useWorkspace.setState({ sessionConfig: session });
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, sessionConfig]);

  useEffect(() => {
    if (vaultPath) setPathInput(vaultPath);
  }, [vaultPath]);

  const onSwitch = (raw: string) => {
    const path = raw.trim();
    if (!path || navBusy) return;
    setClearError(null);
    void switchVault(path);
  };

  const onLeave = () => {
    if (navBusy || !vaultPath) return;
    setClearError(null);
    void leave();
  };

  const onClearLast = async () => {
    if (busy || !lastVault) return;
    setClearBusy(true);
    setClearError(null);
    try {
      await setLastVault(null);
      const session = await getSessionConfig();
      useWorkspace.setState({ sessionConfig: session });
    } catch (e) {
      setClearError(e instanceof Error ? e.message : String(e));
    } finally {
      setClearBusy(false);
    }
  };

  const boundLabel = vaultLeaf(vaultPath);
  const lastLabel = vaultLeaf(lastVault);
  const sourceLabel = source ?? "—";
  const error = enterError || clearError;

  return (
    <section className="settings-space" aria-label="空间">
      <header className="settings-section-intro">
        <h3 className="settings-section-title">空间</h3>
        <p className="settings-section-desc">
          一个空间对应一个 Obsidian 库。换库即换宇宙，卡片跟着本库走。
        </p>
      </header>

      <div className="settings-card">
        <div className="settings-card-head">
          <p className="shell-label">当前绑定</p>
          <span className="settings-space-badge" data-source={sourceLabel}>
            {sourceLabel}
            {boundLabel ? ` · ${boundLabel}` : ""}
          </span>
        </div>
        <div className="settings-card-body">
          <p
            className={`settings-space-path settings-mono${vaultPath ? "" : " is-empty"}`}
            title={vaultPath ?? undefined}
          >
            {vaultPath ? vaultPath : "未绑定本库"}
          </p>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-head">
          <p className="shell-label">打开 / 更换</p>
        </div>
        <form
          className="settings-card-body"
          onSubmit={(e) => {
            e.preventDefault();
            onSwitch(pathInput);
          }}
        >
          <label className="settings-field">
            <span>Vault 绝对路径</span>
            <input
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="例如：E:\Notes\MyVault"
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="settings-actions">
            <button
              type="submit"
              className="settings-btn primary"
              disabled={busy || !pathInput.trim()}
            >
              {shellPhase === "entering"
                ? "打开中…"
                : vaultPath
                  ? "更换 / 打开"
                  : "打开"}
            </button>
            {vaultPath ? (
              <button
                type="button"
                className="settings-btn ghost"
                disabled={busy}
                onClick={() => onLeave()}
              >
                {shellPhase === "leaving" ? "退出中…" : "退出工作区"}
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="settings-card">
        <div className="settings-card-head">
          <p className="shell-label">记住的库</p>
        </div>
        <div className="settings-card-body">
          <p
            className={`settings-space-path settings-mono${lastVault ? "" : " is-empty"}`}
            title={lastVault ?? undefined}
          >
            {lastVault
              ? lastVault
              : "尚无记录（成功打开后由 Host 写入；退出工作区不会清除）"}
          </p>
          <div className="settings-actions">
            <button
              type="button"
              className="settings-btn"
              disabled={busy || !lastVault}
              onClick={() => {
                if (!lastVault) return;
                setPathInput(lastVault);
                onSwitch(lastVault);
              }}
            >
              {lastLabel ? `使用「${lastLabel}」` : "使用记住的库"}
            </button>
            <button
              type="button"
              className="settings-btn danger-ghost"
              disabled={busy || !lastVault}
              onClick={() => void onClearLast()}
            >
              清除记忆
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <p className="settings-error" role="alert" style={{ marginTop: 14 }}>
          {error}
        </p>
      ) : null}

      <p className="settings-hint">
        更换库走同一进入管道（先关后开）。退出工作区回到门厅，不会清除「记住的库」。浏览器预览无法绑库。
      </p>
    </section>
  );
}
