import { useCallback, useEffect, useState } from "react";
import {
  defaultToolsPrefs,
  getToolsPrefs,
  setToolsPrefs,
  type ToolsPrefs,
  type WebSearchBackend,
} from "../../../lib/tools";

/**
 * Settings · 工具 — bounded Host tools prefs (inquiry tools-search).
 * Visual language matches Runtime / Models: cards, fields, pill toggles.
 */
export default function ToolsSection() {
  const [prefs, setPrefs] = useState<ToolsPrefs>(defaultToolsPrefs());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getToolsPrefs()
      .then((p) => {
        if (alive) setPrefs(p);
      })
      .catch((e) => {
        if (alive) {
          setPrefs(defaultToolsPrefs());
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(async (next: ToolsPrefs) => {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const saved = await setToolsPrefs(next);
      setPrefs(saved);
      setStatus("已保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, []);

  const patch = (partial: Partial<ToolsPrefs>) => {
    const next = { ...prefs, ...partial, version: 1 as const };
    setPrefs(next);
    void save(next);
  };

  return (
    <section className="settings-tools" data-settings-slot="tools" aria-label="工具">
      <header className="settings-section-intro">
        <h3 className="settings-section-title">工具</h3>
        <p className="settings-section-desc">
          探究对话内的有界 Host 工具：库内检索、读链接、可选网页搜索。过程在回合折叠条查看；不改变卡片树。
        </p>
      </header>

      {loading ? (
        <div className="settings-empty-block">
          <p>加载中…</p>
        </div>
      ) : (
        <>
          <div className="settings-card">
            <div className="settings-card-head">
              <p className="shell-label">通用</p>
            </div>
            <div className="settings-card-body">
              <div className="tools-toggle-row">
                <div className="tools-toggle-copy">
                  <span className="tools-toggle-title">启用工具</span>
                  <span className="tools-toggle-desc">
                    关闭后对话不再发起 vault_search / fetch_url / web_search。
                  </span>
                </div>
                <button
                  type="button"
                  className={`settings-toggle${prefs.toolsEnabled ? " on" : ""}`}
                  role="switch"
                  aria-checked={prefs.toolsEnabled}
                  aria-label={prefs.toolsEnabled ? "关闭工具" : "启用工具"}
                  disabled={saving}
                  onClick={() => patch({ toolsEnabled: !prefs.toolsEnabled })}
                />
              </div>

              <label className="settings-field">
                <span>最大工具轮次</span>
                <select
                  value={prefs.maxToolRounds}
                  disabled={saving || !prefs.toolsEnabled}
                  onChange={(e) =>
                    patch({ maxToolRounds: Number(e.target.value) || 3 })
                  }
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} 轮
                    </option>
                  ))}
                </select>
              </label>
              <p className="settings-model-note">
                每轮模型可调用若干工具；达到上限后强制给出最终回答。默认 3。
              </p>
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-card-head">
              <p className="shell-label">网页搜索</p>
            </div>
            <div className="settings-card-body">
              <label className="settings-field">
                <span>搜索后端</span>
                <select
                  value={prefs.webSearchBackend}
                  disabled={saving || !prefs.toolsEnabled}
                  onChange={(e) =>
                    patch({
                      webSearchBackend: e.target.value as WebSearchBackend,
                    })
                  }
                >
                  <option value="off">关闭（默认）</option>
                  <option value="ddg">DuckDuckGo（无需密钥）</option>
                  <option value="tavily">Tavily（需 API Key）</option>
                </select>
              </label>

              {prefs.webSearchBackend === "off" ? (
                <p className="settings-model-note">
                  关闭时若模型调用 web_search，会得到可读错误，可改用库内检索或粘贴
                  URL。
                </p>
              ) : null}

              {prefs.webSearchBackend === "ddg" ? (
                <p className="settings-model-note">
                  桌面版解析 DuckDuckGo HTML；结果不稳定时请改 Tavily 或关闭。
                </p>
              ) : null}

              {prefs.webSearchBackend === "tavily" ? (
                <label className="settings-field">
                  <span>Tavily API Key</span>
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={prefs.tavilyApiKey}
                    disabled={saving || !prefs.toolsEnabled}
                    placeholder="tvly-…"
                    onChange={(e) =>
                      setPrefs((p) => ({
                        ...p,
                        tavilyApiKey: e.target.value,
                      }))
                    }
                    onBlur={(e) => {
                      void save({
                        ...prefs,
                        tavilyApiKey: e.target.value,
                        version: 1,
                      });
                    }}
                  />
                </label>
              ) : null}
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-card-head">
              <p className="shell-label">安全</p>
            </div>
            <div className="settings-card-body">
              <div className="tools-toggle-row">
                <div className="tools-toggle-copy">
                  <span className="tools-toggle-title">允许本机 loopback URL</span>
                  <span className="tools-toggle-desc">
                    默认关闭。开启后 fetch_url 可读 127.0.0.1 / localhost；仍拒绝局域网与
                    metadata。
                  </span>
                </div>
                <button
                  type="button"
                  className={`settings-toggle${prefs.allowLoopbackFetch ? " on" : ""}`}
                  role="switch"
                  aria-checked={prefs.allowLoopbackFetch}
                  aria-label={
                    prefs.allowLoopbackFetch
                      ? "禁止 loopback URL"
                      : "允许 loopback URL"
                  }
                  disabled={saving || !prefs.toolsEnabled}
                  onClick={() =>
                    patch({ allowLoopbackFetch: !prefs.allowLoopbackFetch })
                  }
                />
              </div>
              {prefs.allowLoopbackFetch ? (
                <p className="settings-error tools-warn" role="status">
                  已允许 loopback：仅用于本机调试服务。勿在不信任内容上开启。
                </p>
              ) : (
                <p className="settings-model-note">
                  库内检索始终在已打开 vault 内（materials / concepts /
                  inquiry）。私网与云 metadata 默认拒绝。
                </p>
              )}
            </div>
          </div>

          <p className="settings-hint">
            工具由 Host 执行；模型请求仍走你的 BYOK。过程步骤写在回合折叠条，不进正式回答正文。prefs
            存本机应用配置，不进 vault。
          </p>
        </>
      )}

      {status && !error ? (
        <p className="settings-model-note tools-status" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="settings-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
