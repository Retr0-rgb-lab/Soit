import { useCallback, useEffect, useState } from "react";
import {
  newEntityId,
  type ModelEntry,
  type ModelSettings,
} from "../../../lib/chat";
import { getModelSettings, setModelSettings } from "../../../lib/host";
import ModelForm, { type ModelFormValues } from "./ModelForm";

function notifyChatConfigChanged() {
  window.dispatchEvent(new CustomEvent("soit:chat-config-changed"));
}

function displayName(m: ModelEntry): string {
  return (m.label && m.label.trim()) || m.modelId;
}

type Mode =
  | { kind: "list" }
  | { kind: "add" }
  | { kind: "edit"; model: ModelEntry };

type Props = {
  /** Switch parent tab to 供应商 when no providers exist. */
  onNeedProviders: () => void;
};

/**
 * Settings · 模型 · 可用模型 — catalog list + set active conversation model.
 */
export default function ModelsPanel({ onNeedProviders }: Props) {
  const [settings, setSettings] = useState<ModelSettings | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
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
      setMode({ kind: "list" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onSaveForm = async (values: ModelFormValues) => {
    if (!settings) return;
    const t = Date.now();
    const label = values.label.trim() || undefined;
    if (mode.kind === "add") {
      const model: ModelEntry = {
        id: newEntityId("m"),
        providerId: values.providerId,
        modelId: values.modelId,
        label,
        enabled: true,
        createdAt: t,
        updatedAt: t,
      };
      await persist({
        ...settings,
        models: [...settings.models, model],
      });
      return;
    }
    if (mode.kind === "edit") {
      const id = mode.model.id;
      const models = settings.models.map((m) => {
        if (m.id !== id) return m;
        return {
          ...m,
          providerId: values.providerId,
          modelId: values.modelId,
          label,
          updatedAt: t,
        };
      });
      await persist({ ...settings, models });
    }
  };

  const onToggleEnabled = async (model: ModelEntry, enabled: boolean) => {
    if (!settings) return;
    const t = Date.now();
    const models = settings.models.map((m) =>
      m.id === model.id ? { ...m, enabled, updatedAt: t } : m,
    );
    let activeModelId = settings.activeModelId;
    if (!enabled && activeModelId === model.id) {
      activeModelId = null;
    }
    await persist({ ...settings, models, activeModelId });
  };

  const onSetActive = async (model: ModelEntry) => {
    if (!settings || !model.enabled) return;
    if (settings.activeModelId === model.id) return;
    await persist({ ...settings, activeModelId: model.id });
  };

  const onDelete = async (model: ModelEntry) => {
    if (!settings) return;
    const name = displayName(model);
    const ok = window.confirm(`删除模型「${name}」？`);
    if (!ok) return;
    const models = settings.models.filter((m) => m.id !== model.id);
    let activeModelId = settings.activeModelId;
    if (activeModelId === model.id) {
      activeModelId = null;
    }
    await persist({ ...settings, models, activeModelId });
  };

  if (!settings) {
    return (
      <div className="settings-models" aria-label="可用模型">
        <p className="settings-placeholder">加载中…</p>
      </div>
    );
  }

  if (mode.kind === "add" || mode.kind === "edit") {
    return (
      <div className="settings-models" aria-label="可用模型">
        <div className="settings-card">
          <div className="settings-card-head">
            <p className="shell-label">
              {mode.kind === "add" ? "添加模型" : "编辑模型"}
            </p>
          </div>
          <div className="settings-card-body">
            <ModelForm
              initial={mode.kind === "edit" ? mode.model : null}
              providers={settings.providers}
              saving={saving}
              onSave={onSaveForm}
              onCancel={() => setMode({ kind: "list" })}
            />
            {error ? (
              <p className="settings-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const { providers, models, activeModelId } = settings;
  const providerName = (providerId: string) =>
    providers.find((p) => p.id === providerId)?.name ?? "未知供应商";

  if (providers.length === 0) {
    return (
      <div className="settings-models" aria-label="可用模型">
        <div className="settings-empty-block">
          <p>请先添加供应商。</p>
          <button
            type="button"
            className="settings-btn primary"
            onClick={onNeedProviders}
          >
            前往添加供应商
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-models" aria-label="可用模型">
      <p className="settings-model-note">
        选用一个启用模型作为当前对话模型。未选用时使用 Mock。
      </p>

      {models.length === 0 ? (
        <div className="settings-empty-block">
          <p>尚未添加模型。</p>
          <button
            type="button"
            className="settings-btn primary"
            onClick={() => setMode({ kind: "add" })}
          >
            添加模型
          </button>
        </div>
      ) : (
        <>
          <ul className="settings-model-list">
            {models.map((m) => {
              const isActive = activeModelId === m.id;
              const title = displayName(m);
              const showIdUnder = Boolean(m.label && m.label.trim());
              return (
                <li key={m.id} className="settings-model-row">
                  <div className="settings-model-meta">
                    <div className="settings-model-title-row">
                      <span className="settings-model-name">{title}</span>
                      {isActive ? (
                        <span className="settings-model-active-badge">
                          对话中
                        </span>
                      ) : null}
                    </div>
                    {showIdUnder ? (
                      <span className="settings-model-id" title={m.modelId}>
                        {m.modelId}
                      </span>
                    ) : null}
                    <span className="settings-model-provider">
                      {providerName(m.providerId)}
                    </span>
                  </div>
                  <div className="settings-model-actions">
                    <button
                      type="button"
                      className={`settings-toggle${m.enabled ? " on" : ""}`}
                      role="switch"
                      aria-checked={m.enabled}
                      aria-label={m.enabled ? "已启用" : "已停用"}
                      disabled={saving}
                      onClick={() => void onToggleEnabled(m, !m.enabled)}
                    />
                    <button
                      type="button"
                      className="settings-btn ghost"
                      disabled={saving || !m.enabled || isActive}
                      onClick={() => void onSetActive(m)}
                    >
                      {isActive ? "使用中" : "设为对话"}
                    </button>
                    <button
                      type="button"
                      className="settings-btn ghost"
                      disabled={saving}
                      onClick={() => setMode({ kind: "edit", model: m })}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="settings-btn danger-ghost"
                      disabled={saving}
                      onClick={() => void onDelete(m)}
                    >
                      删除
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="settings-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="settings-btn primary"
              disabled={saving}
              onClick={() => setMode({ kind: "add" })}
            >
              添加模型
            </button>
          </div>
        </>
      )}

      {error ? (
        <p className="settings-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
