import { useState } from "react";
import type { Provider } from "../../../lib/chat";

export type ProviderFormValues = {
  name: string;
  baseUrl: string;
  apiKey: string;
};

type Props = {
  /** null = add mode; otherwise edit existing (apiKey empty keeps current). */
  initial: Provider | null;
  saving?: boolean;
  onSave: (values: ProviderFormValues) => void | Promise<void>;
  onCancel: () => void;
};

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Add / edit provider credentials (OpenAI-compatible endpoint + key).
 */
export default function ProviderForm({
  initial,
  saving = false,
  onSave,
  onCancel,
}: Props) {
  const isEdit = initial != null;
  const [name, setName] = useState(initial?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const n = name.trim();
    const url = baseUrl.trim();
    const key = apiKey.trim();
    if (!n) {
      setError("请填写名称");
      return;
    }
    if (!url) {
      setError("请填写 Base URL");
      return;
    }
    if (!isHttpUrl(url)) {
      setError("Base URL 须为 http(s) 地址");
      return;
    }
    if (!isEdit && !key) {
      setError("请填写 API Key");
      return;
    }
    setError(null);
    await onSave({ name: n, baseUrl: url, apiKey: key });
  };

  return (
    <div className="settings-provider-form" aria-label={isEdit ? "编辑供应商" : "添加供应商"}>
      <label className="settings-field">
        <span>名称</span>
        <input
          type="text"
          value={name}
          placeholder="如 OpenAI、DeepSeek"
          autoComplete="off"
          disabled={saving}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="settings-field">
        <span>Base URL</span>
        <input
          type="url"
          value={baseUrl}
          placeholder="https://api.openai.com/v1"
          autoComplete="off"
          disabled={saving}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </label>
      <label className="settings-field">
        <span>API Key</span>
        <input
          type="password"
          value={apiKey}
          placeholder={
            isEdit && initial?.apiKey
              ? "留空则保留已有密钥"
              : "本机密钥，不进宇宙库"
          }
          autoComplete="off"
          disabled={saving}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </label>
      {error ? (
        <p className="settings-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="settings-actions trailing">
        <button
          type="button"
          className="settings-btn ghost"
          disabled={saving}
          onClick={onCancel}
        >
          取消
        </button>
        <button
          type="button"
          className="settings-btn primary"
          disabled={saving}
          onClick={() => void submit()}
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}
