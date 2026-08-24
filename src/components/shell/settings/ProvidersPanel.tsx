import { useCallback, useEffect, useState } from "react";
import {
  newEntityId,
  type ModelSettings,
  type Provider,
} from "../../../lib/chat";
import { getModelSettings, setModelSettings } from "../../../lib/host";
import ProviderForm, { type ProviderFormValues } from "./ProviderForm";

function notifyChatConfigChanged() {
  window.dispatchEvent(new CustomEvent("soit:chat-config-changed"));
}

function truncateUrl(url: string, max = 42): string {
  const t = url.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function keyStatus(p: Provider): "configured" | "empty" {
  return p.apiKey.trim() ? "configured" : "empty";
}

type Mode =
  | { kind: "list" }
  | { kind: "add" }
  | { kind: "edit"; provider: Provider };

/**
 * Settings · 模型 · 供应商 — BYOK credential list + add/edit/delete.
 */
export default function ProvidersPanel() {
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

  const onSaveForm = async (values: ProviderFormValues) => {
    if (!settings) return;
    const t = Date.now();
    if (mode.kind === "add") {
      const provider: Provider = {
        id: newEntityId("p"),
        name: values.name,
        baseUrl: values.baseUrl,
        apiKey: values.apiKey,
        createdAt: t,
        updatedAt: t,
      };
      await persist({
        ...settings,
        providers: [...settings.providers, provider],
      });
      return;
    }
    if (mode.kind === "edit") {
      const id = mode.provider.id;
      const providers = settings.providers.map((p) => {
        if (p.id !== id) return p;
        return {
          ...p,
          name: values.name,
          baseUrl: values.baseUrl,
          // Empty apiKey on edit = keep existing
          apiKey: values.apiKey ? values.apiKey : p.apiKey,
          updatedAt: t,
        };
      });
      await persist({ ...settings, providers });
    }
  };

  const onDelete = async (provider: Provider) => {
    if (!settings) return;
    const ok = window.confirm(
      `删除供应商「${provider.name}」？其下模型将一并删除。`,
    );
    if (!ok) return;

    const models = settings.models.filter((m) => m.providerId !== provider.id);
    const removedIds = new Set(
      settings.models
        .filter((m) => m.providerId === provider.id)
        .map((m) => m.id),
    );
    let activeModelId = settings.activeModelId;
    if (activeModelId && removedIds.has(activeModelId)) {
      activeModelId = null;
    }
    await persist({
      ...settings,
      providers: settings.providers.filter((p) => p.id !== provider.id),
      models,
      activeModelId,
    });
  };

  if (!settings) {
    return (
      <div className="settings-providers" aria-label="供应商">
        <p className="settings-placeholder">加载中…</p>
      </div>
    );
  }

  if (mode.kind === "add" || mode.kind === "edit") {
    return (
      <div className="settings-providers" aria-label="供应商">
        <div className="settings-card">
          <div className="settings-card-head">
            <p className="shell-label">
              {mode.kind === "add" ? "添加供应商" : "编辑供应商"}
            </p>
          </div>
          <div className="settings-card-body">
            <ProviderForm
              initial={mode.kind === "edit" ? mode.provider : null}
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

  const providers = settings.providers;

  return (
    <div className="settings-providers" aria-label="供应商">
      <p className="settings-model-note">
        密钥只存本机。对话模型在「可用模型」中选择。
      </p>

      {providers.length === 0 ? (
        <div className="settings-empty-block">
          <p>尚未添加供应商。</p>
          <button
            type="button"
            className="settings-btn primary"
            onClick={() => setMode({ kind: "add" })}
          >
            添加供应商
          </button>
        </div>
      ) : (
        <>
          <ul className="settings-provider-list">
            {providers.map((p) => {
              const status = keyStatus(p);
              return (
                <li key={p.id} className="settings-provider-row">
                  <div className="settings-provider-meta">
                    <span className="settings-provider-name">{p.name}</span>
                    <span className="settings-provider-url" title={p.baseUrl}>
                      {truncateUrl(p.baseUrl)}
                    </span>
                    <span
                      className="settings-provider-key-status"
                      data-status={status}
                    >
                      {status === "configured" ? "已配置" : "未配置"}
                    </span>
                  </div>
                  <div className="settings-provider-actions">
                    <button
                      type="button"
                      className="settings-btn ghost"
                      disabled={saving}
                      onClick={() => setMode({ kind: "edit", provider: p })}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="settings-btn danger-ghost"
                      disabled={saving}
                      onClick={() => void onDelete(p)}
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
              添加供应商
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
