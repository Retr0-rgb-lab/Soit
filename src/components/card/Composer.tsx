import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_CHAT_CONFIG,
  hasApiKey,
  portKindFromConfig,
  type ChatConfig,
} from "../../lib/chat";
import { getChatConfig, setChatConfig } from "../../lib/host";
import { IconSend } from "./icons";

interface Props {
  draft: string;
  quote: string;
  onDraftChange: (v: string) => void;
  onClearQuote: () => void;
  onSend: () => void;
  disabled?: boolean;
}

function chipLabel(cfg: ChatConfig): string {
  if (portKindFromConfig(cfg) === "mock") return "Mock · 本地";
  const model = cfg.model.trim() || "model";
  return model.length > 18 ? `${model.slice(0, 16)}…` : model;
}

function chipTip(cfg: ChatConfig): string {
  if (portKindFromConfig(cfg) === "mock") {
    return "未配置 API Key · 使用 MockChat（点击设置 BYOK）";
  }
  return `${cfg.baseUrl || "endpoint"} · ${cfg.model || "model"}（点击改配置）`;
}

export default function Composer({
  draft,
  quote,
  onDraftChange,
  onClearQuote,
  onSend,
  disabled,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [cfg, setCfg] = useState<ChatConfig>({ ...DEFAULT_CHAT_CONFIG });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftCfg, setDraftCfg] = useState<ChatConfig>({ ...DEFAULT_CHAT_CONFIG });
  const [saving, setSaving] = useState(false);

  const reloadConfig = useCallback(async () => {
    const c = await getChatConfig();
    setCfg(c);
    setDraftCfg(c);
  }, []);

  useEffect(() => {
    void reloadConfig();
  }, [reloadConfig]);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(120, el.scrollHeight)}px`;
  }, [draft]);

  const onSaveSettings = async () => {
    setSaving(true);
    try {
      await setChatConfig(draftCfg);
      await reloadConfig();
      setSettingsOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const kind = portKindFromConfig(cfg);

  return (
    <div className="ic-dock-wrap">
      {settingsOpen ? (
        <div className="ic-chat-settings" role="dialog" aria-label="对话模型配置">
          <div className="ic-chat-settings-title">
            BYOK · OpenAI 兼容
            <span className="ic-chat-settings-note">
              密钥仅存本机（localStorage / app config），不进宇宙库
            </span>
          </div>
          <label>
            Base URL
            <input
              type="url"
              value={draftCfg.baseUrl}
              placeholder="https://api.openai.com/v1"
              onChange={(e) =>
                setDraftCfg((c) => ({ ...c, baseUrl: e.target.value }))
              }
            />
          </label>
          <label>
            Model
            <input
              type="text"
              value={draftCfg.model}
              placeholder="gpt-4o-mini"
              onChange={(e) =>
                setDraftCfg((c) => ({ ...c, model: e.target.value }))
              }
            />
          </label>
          <label>
            API Key
            <input
              type="password"
              value={draftCfg.apiKey}
              placeholder={hasApiKey(cfg) ? "••••••••" : "未配置则走 MockChat"}
              autoComplete="off"
              onChange={(e) =>
                setDraftCfg((c) => ({ ...c, apiKey: e.target.value }))
              }
            />
          </label>
          <div className="ic-chat-settings-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setDraftCfg(cfg);
                setSettingsOpen(false);
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() =>
                setDraftCfg({ ...DEFAULT_CHAT_CONFIG, apiKey: "" })
              }
            >
              清密钥
            </button>
            <button type="button" disabled={saving} onClick={() => void onSaveSettings()}>
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="ic-dock">
        <button
          type="button"
          className={`model${kind === "mock" ? " is-mock" : " is-byok"}`}
          data-tip={chipTip(cfg)}
          aria-expanded={settingsOpen}
          onClick={() => {
            setDraftCfg(cfg);
            setSettingsOpen((o) => !o);
          }}
        >
          {chipLabel(cfg)}
        </button>
        <div className="fields">
          <div className={`ic-quote-chip${quote ? " on" : ""}`}>
            <span>
              引用 · {quote.slice(0, 48)}
              {quote.length > 48 ? "…" : ""}
            </span>
            <button type="button" data-tip="去掉引用" onClick={onClearQuote} aria-label="去掉引用">
              ×
            </button>
          </div>
          <textarea
            ref={taRef}
            value={draft}
            placeholder={
              kind === "mock"
                ? "写在这张卡上…（Mock 回复，可点左侧配置 Key）"
                : "写在这张卡上…"
            }
            rows={1}
            disabled={disabled}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <div className="hint">Enter 换行 · Ctrl+Enter 发送</div>
        </div>
        <button
          type="button"
          className="send"
          data-tip="发送"
          aria-label="发送"
          disabled={disabled || !draft.trim()}
          onClick={onSend}
        >
          <IconSend />
        </button>
      </div>
    </div>
  );
}
