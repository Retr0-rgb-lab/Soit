import { useCallback, useEffect, useState } from "react";
import { getModelSettings } from "../../../lib/host";
import ModelsPanel from "./ModelsPanel";
import ProvidersPanel from "./ProvidersPanel";

type ModelTab = "providers" | "models";

/**
 * Settings · 模型 — section shell with sub-tabs 供应商 | 可用模型.
 */
export default function ModelSettingsForm() {
  const [tab, setTab] = useState<ModelTab | null>(null);

  const pickDefaultTab = useCallback(async () => {
    try {
      const s = await getModelSettings();
      setTab(s.providers.length === 0 ? "providers" : "models");
    } catch {
      setTab("providers");
    }
  }, []);

  useEffect(() => {
    void pickDefaultTab();
  }, [pickDefaultTab]);

  const active: ModelTab = tab ?? "providers";

  return (
    <div className="settings-model-section" aria-label="模型设置">
      <div className="settings-section-intro">
        <h3 className="settings-section-title">模型</h3>
        <p className="settings-section-desc">
          本机 BYOK：先添加供应商凭证，再在可用模型中选用对话模型。密钥不进宇宙库。
        </p>
      </div>

      <div className="settings-model-subnav" role="tablist" aria-label="模型子段">
        <button
          type="button"
          role="tab"
          aria-selected={active === "providers"}
          className={`settings-model-subnav-btn${active === "providers" ? " on" : ""}`}
          onClick={() => setTab("providers")}
        >
          供应商
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === "models"}
          className={`settings-model-subnav-btn${active === "models" ? " on" : ""}`}
          onClick={() => setTab("models")}
        >
          可用模型
        </button>
      </div>

      <div role="tabpanel" className="settings-model-panel">
        {active === "providers" ? (
          <ProvidersPanel />
        ) : (
          <ModelsPanel onNeedProviders={() => setTab("providers")} />
        )}
      </div>
    </div>
  );
}
