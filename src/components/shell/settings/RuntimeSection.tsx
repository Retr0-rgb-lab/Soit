import { useCallback, useEffect, useState } from "react";
import { DEFAULT_RUNTIME_PREFS } from "../../../lib/runtime";
import { useWorkspace } from "../../../state/workspaceStore";

/**
 * Settings · 运行时 — detect/list external agents + prefs (lazy on mount).
 * Spec v1.1 §2.7 — does not run at App boot.
 */
export default function RuntimeSection() {
  const runtimes = useWorkspace((s) => s.runtimes);
  const runtimePrefs = useWorkspace((s) => s.runtimePrefs);
  const refreshRuntimes = useWorkspace((s) => s.refreshRuntimes);
  const loadRuntimePrefs = useWorkspace((s) => s.loadRuntimePrefs);
  const setRuntimePrefs = useWorkspace((s) => s.setRuntimePrefs);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const prefs = runtimePrefs ?? DEFAULT_RUNTIME_PREFS;

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadRuntimePrefs(), refreshRuntimes()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [loadRuntimePrefs, refreshRuntimes]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const onRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await refreshRuntimes();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const onDefaultChange = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await setRuntimePrefs({ defaultRuntimeId: id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onEnableSpawn = async (next: boolean) => {
    setSaving(true);
    setError(null);
    try {
      await setRuntimePrefs({ enableSpawn: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const defaultOptions =
    runtimes.length > 0
      ? runtimes
      : [
          {
            id: "mock",
            name: "Mock",
            kind: "mock",
            available: true,
            detail: "built-in",
          },
        ];

  return (
    <section className="settings-runtime" aria-label="运行时">
      <header className="settings-section-intro">
        <h3 className="settings-section-title">运行时</h3>
        <p className="settings-section-desc">
          本机 coding agent 作执行后端。外部 agent 不拥有卡片；卡片真相仍在
          universe.db。
        </p>
      </header>

      {loading && !runtimePrefs ? (
        <div className="settings-empty-block">
          <p>加载中…</p>
        </div>
      ) : (
        <>
          <div className="settings-card">
            <div className="settings-card-head">
              <p className="shell-label">默认 Runtime</p>
              <button
                type="button"
                className="settings-btn ghost"
                disabled={refreshing || loading}
                onClick={() => void onRefresh()}
              >
                {refreshing ? "检测中…" : "刷新检测"}
              </button>
            </div>
            <div className="settings-card-body">
              <label className="settings-field">
                <span>交给本地 Agent 时使用</span>
                <select
                  value={prefs.defaultRuntimeId || "mock"}
                  disabled={saving}
                  onChange={(e) => void onDefaultChange(e.target.value)}
                >
                  {defaultOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name || r.id}
                      {r.available ? "" : "（不可用）"}
                    </option>
                  ))}
                </select>
              </label>

              <ul className="runtime-list" aria-label="已检测运行时">
                {defaultOptions.map((r) => (
                  <li key={r.id} className="runtime-row">
                    <div className="runtime-meta">
                      <span className="runtime-name">{r.name || r.id}</span>
                      <span className="runtime-id">
                        {r.id}
                        {r.kind ? ` · ${r.kind}` : ""}
                        {r.version ? ` · ${r.version}` : ""}
                      </span>
                      {r.detail ? (
                        <span className="runtime-detail">{r.detail}</span>
                      ) : null}
                    </div>
                    <span
                      className={`runtime-badge${r.available ? " ok" : ""}`}
                      data-available={r.available ? "true" : "false"}
                    >
                      {r.available ? "可用" : "未找到"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-card-head">
              <p className="shell-label">进程 spawn</p>
            </div>
            <div className="settings-card-body">
              <div className="runtime-spawn-row">
                <div className="runtime-spawn-copy">
                  <span className="runtime-spawn-title">允许真进程 spawn</span>
                  <span className="runtime-spawn-desc">
                    默认关闭。开启后本机可能执行外部 agent 代码，有安全风险。
                  </span>
                </div>
                <button
                  type="button"
                  className={`skills-toggle${prefs.enableSpawn ? " on" : ""}`}
                  role="switch"
                  aria-checked={prefs.enableSpawn}
                  aria-label={
                    prefs.enableSpawn
                      ? "关闭真进程 spawn"
                      : "开启真进程 spawn"
                  }
                  disabled={saving}
                  onClick={() => void onEnableSpawn(!prefs.enableSpawn)}
                >
                  {prefs.enableSpawn ? "开" : "关"}
                </button>
              </div>
              {prefs.enableSpawn ? (
                <p className="settings-error runtime-spawn-warn" role="status">
                  已启用 spawn：外部 CLI 可在本机跑代码。仅在你信任的库与
                  agent 上使用；卡片真相仍只写 universe.db，不把 vault
                  交给外部会话。
                </p>
              ) : (
                <p className="settings-model-note">
                  关闭时仅 Mock handoff 可用；Host 会拒绝非 mock 真 spawn。
                </p>
              )}
            </div>
          </div>

          <p className="settings-hint">
            外部 agent 不拥有卡片树；handoff 结果写回当前卡 turn。spawn
            有本机代码执行风险；prefs 存本机应用配置，不进 vault。
          </p>
        </>
      )}

      {error ? (
        <p className="settings-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
