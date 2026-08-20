import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_CHAT_CONFIG,
  hasApiKey,
  portKindFromConfig,
  type ChatConfig,
} from "../../../lib/chat";
import { getChatConfig, setChatConfig } from "../../../lib/host";

function notifyChatConfigChanged() {
  window.dispatchEvent(new CustomEvent("soit:chat-config-changed"));
}

/**
 * BYOK model settings — OpenAI-compatible endpoint + key.
 * Mounted inside SettingsPanel model section (not Composer).
 */
export default function ModelSettingsForm() {
  const [cfg, setCfg] = useState<ChatConfig>({ ...DEFAULT_CHAT_CONFIG });
  const [draft, setDraft] = useState<ChatConfig>({ ...DEFAULT_CHAT_CONFIG });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const c = await getChatConfig();
    setCfg(c);
    setDraft(c);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await setChatConfig(draft);
      await reload();
      notifyChatConfigChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onClearKey = async () => {
    setSaving(true);
    setError(null);
    try {
      const cleared: ChatConfig = { ...draft, apiKey: "" };
      setDraft(cleared);
      await setChatConfig(cleared);
      await reload();
      notifyChatConfigChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const kind = portKindFromConfig(cfg);
  const live = hasApiKey(cfg);

  return (
    <section className="settings-model-form" aria-label="对话模型配置">
      <header className="settings-section-intro">
        <h3 className="settings-section-title">模型</h3>
        <p className="settings-section-desc">
          OpenAI 兼容接口。密钥只存本机应用配置，永不写入宇宙库。
        </p>
      </header>

      <div
        className="settings-model-status"
        data-kind={kind}
        title={live ? cfg.baseUrl : "未配置 API Key"}
      >
        {kind === "mock" ? "Mock · 本地占位" : `在线 · ${cfg.model || "model"}`}
      </div>

      <div className="settings-card" style={{ marginTop: 14 }}>
        <div className="settings-card-head">
          <p className="shell-label">BYOK · OpenAI 兼容</p>
        </div>
        <div className="settings-card-body">
          <label className="settings-field">
            <span>Base URL</span>
            <input
              type="url"
              value={draft.baseUrl}
              placeholder="https://api.openai.com/v1"
              onChange={(e) =>
                setDraft((c) => ({ ...c, baseUrl: e.target.value }))
              }
            />
          </label>
          <label className="settings-field">
            <span>Model</span>
            <input
              type="text"
              value={draft.model}
              placeholder="gpt-4o-mini"
              onChange={(e) =>
                setDraft((c) => ({ ...c, model: e.target.value }))
              }
            />
          </label>
          <label className="settings-field">
            <span>API Key</span>
            <input
              type="password"
              value={draft.apiKey}
              placeholder={live ? "••••••••（留空保存可覆盖）" : "未配置则走 MockChat"}
              autoComplete="off"
              onChange={(e) =>
                setDraft((c) => ({ ...c, apiKey: e.target.value }))
              }
            />
          </label>
          <p className="settings-model-note">
            桌面版写入 app config；开发浏览器会镜像 localStorage。
          </p>
          {error ? (
            <p className="settings-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="settings-actions trailing">
            <button
              type="button"
              className="settings-btn danger-ghost"
              disabled={saving}
              onClick={() => void onClearKey()}
            >
              清密钥
            </button>
            <button
              type="button"
              className="settings-btn primary"
              disabled={saving}
              onClick={() => void onSave()}
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
