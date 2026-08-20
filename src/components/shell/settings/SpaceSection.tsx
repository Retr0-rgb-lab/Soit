import { useCallback, useEffect, useState } from "react";
import { demoSnapshot } from "../../../lib/demoSeed";
import {
  closeUniverse,
  getLastVault,
  openUniverse,
  setLastVault,
} from "../../../lib/host";
import { useWorkspace } from "../../../state/workspaceStore";

type Props = {
  /** When true (settings space tab visible), refresh lastVault display. */
  active?: boolean;
};

function mapOpenError(err: string | undefined): string {
  const raw = (err ?? "打开失败").trim();
  if (
    /requires tauri/i.test(raw) ||
    /tauri-missing/i.test(raw) ||
    /browser stays on demo/i.test(raw)
  ) {
    return "需要桌面版";
  }
  return raw || "打开失败";
}

function vaultLeaf(path: string | null): string | null {
  if (!path) return null;
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? path;
}

/**
 * Settings · 空间 — bind / switch / unbind vault + lastVault controls.
 * Spec v1.1 §2.2: beginBootLoad epoch, close-then-open, Host writes lastVault.
 */
export default function SpaceSection({ active = true }: Props) {
  const vaultPath = useWorkspace((s) => s.vaultPath);
  const source = useWorkspace((s) => s.source);
  const beginBootLoad = useWorkspace((s) => s.beginBootLoad);
  const loadSnapshot = useWorkspace((s) => s.loadSnapshot);
  const setVaultPath = useWorkspace((s) => s.setVaultPath);

  const [pathInput, setPathInput] = useState(vaultPath ?? "");
  const [lastVault, setLastVaultState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshLastVault = useCallback(async () => {
    try {
      const last = await getLastVault();
      setLastVaultState(last);
    } catch {
      setLastVaultState(null);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void refreshLastVault();
  }, [active, refreshLastVault]);

  useEffect(() => {
    if (vaultPath) setPathInput(vaultPath);
  }, [vaultPath]);

  const openPath = async (raw: string) => {
    const path = raw.trim();
    if (!path || busy) return;

    const epoch = beginBootLoad();
    setBusy(true);
    setError(null);
    try {
      if (vaultPath && vaultPath !== path) {
        await closeUniverse();
      }
      const res = await openUniverse(path);
      if (!res.ok) {
        setError(mapOpenError(res.error));
        return;
      }
      setVaultPath(res.path);
      setPathInput(res.path);
      if (res.snapshot) loadSnapshot(res.snapshot, epoch);
      // Host already wrote lastVault on successful open.
      await refreshLastVault();
    } catch (e) {
      setError(mapOpenError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const onUnbind = async () => {
    if (busy) return;
    const epoch = beginBootLoad();
    setBusy(true);
    setError(null);
    try {
      await closeUniverse();
      setVaultPath(null);
      loadSnapshot(demoSnapshot(), epoch);
      // closeUniverse does not clear lastVault.
      await refreshLastVault();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onClearLast = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await setLastVault(null);
      setLastVaultState(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const boundLabel = vaultLeaf(vaultPath);
  const lastLabel = vaultLeaf(lastVault);
  const sourceLabel = source ?? "—";

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
            void openPath(pathInput);
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
              {busy ? "处理中…" : vaultPath ? "更换 / 打开" : "打开"}
            </button>
            {vaultPath ? (
              <button
                type="button"
                className="settings-btn ghost"
                disabled={busy}
                onClick={() => void onUnbind()}
              >
                解绑
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
              : "尚无记录（成功打开后由 Host 写入；解绑不会清除）"}
          </p>
          <div className="settings-actions">
            <button
              type="button"
              className="settings-btn"
              disabled={busy || !lastVault}
              onClick={() => {
                if (lastVault) {
                  setPathInput(lastVault);
                  void openPath(lastVault);
                }
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
        绑定只打开本机 vault 的 .soit/universe.db。浏览器预览无法绑库。清除记忆不会解绑当前会话。
      </p>
    </section>
  );
}
