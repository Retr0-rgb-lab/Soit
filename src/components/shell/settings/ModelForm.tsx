import { useState } from "react";
import type { ModelEntry, Provider } from "../../../lib/chat";

export type ModelFormValues = {
  providerId: string;
  modelId: string;
  label: string;
};

type Props = {
  /** null = add mode; otherwise edit existing. */
  initial: ModelEntry | null;
  providers: Provider[];
  saving?: boolean;
  onSave: (values: ModelFormValues) => void | Promise<void>;
  onCancel: () => void;
};

/**
 * Add / edit a catalog model under a provider.
 */
export default function ModelForm({
  initial,
  providers,
  saving = false,
  onSave,
  onCancel,
}: Props) {
  const isEdit = initial != null;
  const defaultProviderId =
    initial?.providerId ?? providers[0]?.id ?? "";
  const [providerId, setProviderId] = useState(defaultProviderId);
  const [modelId, setModelId] = useState(initial?.modelId ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const pid = providerId.trim();
    const mid = modelId.trim();
    const lab = label.trim();
    if (!pid) {
      setError("请选择供应商");
      return;
    }
    if (!providers.some((p) => p.id === pid)) {
      setError("供应商不存在");
      return;
    }
    if (!mid) {
      setError("请填写 Model ID");
      return;
    }
    setError(null);
    await onSave({ providerId: pid, modelId: mid, label: lab });
  };

  return (
    <div
      className="settings-model-form"
      aria-label={isEdit ? "编辑模型" : "添加模型"}
    >
      <label className="settings-field">
        <span>供应商</span>
        <select
          value={providerId}
          disabled={saving || providers.length === 0}
          onChange={(e) => setProviderId(e.target.value)}
        >
          {providers.length === 0 ? (
            <option value="">无可用供应商</option>
          ) : null}
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-field">
        <span>Model ID</span>
        <input
          type="text"
          value={modelId}
          placeholder="如 gpt-4o-mini"
          autoComplete="off"
          disabled={saving}
          onChange={(e) => setModelId(e.target.value)}
        />
      </label>
      <label className="settings-field">
        <span>显示名（可选）</span>
        <input
          type="text"
          value={label}
          placeholder="留空则用 Model ID"
          autoComplete="off"
          disabled={saving}
          onChange={(e) => setLabel(e.target.value)}
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
