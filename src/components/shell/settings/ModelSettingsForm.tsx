import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_CHAT_CONFIG,
  hasApiKey,
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

  return (
    <div className="settings-model-form" aria-label="对话模型配置">
      <div className="settings-model-form-title">
        BYOK · OpenAI 兼容
        <span className="settings-model-form-note">
          密钥仅存本机（localStorage / app config），不进宇宙库
        </span>
      </div>
      <label>
        Base URL
        <input
          type="url"
          value={draft.baseUrl}
          placeholder="https://api.openai.com/v1"
          onChange={(e) =>
            setDraft((c) => ({ ...c, baseUrl: e.target.value }))
          }
        />
      </label>
      <label>
        Model
        <input
          type="text"
          value={draft.model}
          placeholder="gpt-4o-mini"
          onChange={(e) =>
            setDraft((c) => ({ ...c, model: e.target.value }))
          }
        />
      </label>
      <label>
        API Key
        <input
          type="password"
          value={draft.apiKey}
          placeholder={hasApiKey(cfg) ? "••••••••" : "未配置则走 MockChat"}
          autoComplete="off"
          onChange={(e) =>
            setDraft((c) => ({ ...c, apiKey: e.target.value }))
          }
        />
      </label>
      {error ? (
        <div className="settings-model-form-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="settings-model-form-actions">
        <button
          type="button"
          className="ghost"
          disabled={saving}
          onClick={() => void onClearKey()}
        >
          清密钥
        </button>
        <button type="button" disabled={saving} onClick={() => void onSave()}>
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}
