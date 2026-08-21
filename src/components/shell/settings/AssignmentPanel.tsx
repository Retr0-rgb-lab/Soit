import { useCallback, useEffect, useState } from "react";
import type { ModelEntry, ModelSettings } from "../../../lib/chat";
import { getModelSettings, setModelSettings } from "../../../lib/host";

function notifyChatConfigChanged() {
  window.dispatchEvent(new CustomEvent("soit:chat-config-changed"));
}

function displayName(m: ModelEntry): string {
  return m.label?.trim() || m.modelId;
}

type Props = {
  onNeedModels: () => void;
};

/**
 * Settings · 模型 · 分配 — bind enabled models to chat vs explain slots.
 */
export default function AssignmentPanel({ onNeedModels }: Props) {
  const [settings, setSettings] = useState<ModelSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const s = await getModelSettings();
    setSettings(s);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const persist = async (next: ModelSettings) => {
    setSaving(true);
    setError(null);
    try {
      await setModelSettings(next);
      await reload();
      notifyChatConfigChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="settings-assign" aria-label="分配">
        <p className="settings-placeholder">加载中…</p>
      </div>
    );
  }

  const enabled = settings.models.filter((m) => m.enabled);

  if (enabled.length === 0) {
    return (
      <div className="settings-assign" aria-label="分配">
        <div className="settings-empty-block">
          <p>请先在可用模型中添加并启用。</p>
          <button
            type="button"
            className="settings-btn primary"
            onClick={onNeedModels}
          >
            前往可用模型
          </button>
        </div>
      </div>
    );
  }

  const explainEntry = settings.explainModelId
    ? enabled.find((m) => m.id === settings.explainModelId)
    : undefined;
  const explainProvider = explainEntry
    ? settings.providers.find((p) => p.id === explainEntry.providerId)
    : undefined;
  const explainKeyMissing = Boolean(
    explainEntry && explainProvider && !explainProvider.apiKey.trim(),
  );

  return (
    <div className="settings-assign" aria-label="分配">
      <label className="settings-field">
        <span>对话模型</span>
        <select
          value={settings.activeModelId ?? ""}
          disabled={saving}
          onChange={(e) =>
            void persist({
              ...settings,
              activeModelId: e.target.value ? e.target.value : null,
            })
          }
        >
          <option value="">Mock（未选用）</option>
          {enabled.map((m) => (
            <option key={m.id} value={m.id}>
              {displayName(m)}
            </option>
          ))}
        </select>
        <span className="settings-model-note">
          卡片作曲与发消息。也可在作曲条切换。
        </span>
      </label>

      <label className="settings-field">
        <span>短解释模型</span>
        <select
          value={settings.explainModelId ?? ""}
          disabled={saving}
          onChange={(e) =>
            void persist({
              ...settings,
              explainModelId: e.target.value ? e.target.value : null,
            })
          }
        >
          <option value="">跟随对话</option>
          {enabled.map((m) => (
            <option key={m.id} value={m.id}>
              {displayName(m)}
            </option>
          ))}
        </select>
        <span className="settings-model-note">
          点词 / 划词浮层。建议用更快更便宜的模型。
        </span>
        {explainKeyMissing ? (
          <span className="settings-model-note">
            该供应商未配置密钥，短解释将跟随对话。
          </span>
        ) : null}
      </label>

      {error ? (
        <p className="settings-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
