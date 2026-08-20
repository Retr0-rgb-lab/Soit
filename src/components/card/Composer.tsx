import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_CHAT_CONFIG,
  portKindFromConfig,
  type ChatConfig,
} from "../../lib/chat";
import { getChatConfig } from "../../lib/host";
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

  const reloadConfig = useCallback(async () => {
    const c = await getChatConfig();
    setCfg(c);
  }, []);

  useEffect(() => {
    void reloadConfig();
  }, [reloadConfig]);

  useEffect(() => {
    const onChanged = () => {
      void reloadConfig();
    };
    window.addEventListener("soit:chat-config-changed", onChanged);
    return () => window.removeEventListener("soit:chat-config-changed", onChanged);
  }, [reloadConfig]);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(120, el.scrollHeight)}px`;
  }, [draft]);

  const kind = portKindFromConfig(cfg);

  return (
    <div className="ic-dock-wrap">
      <div className="ic-dock">
        <button
          type="button"
          className={`model${kind === "mock" ? " is-mock" : " is-byok"}`}
          data-tip={chipTip(cfg)}
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("soit:open-settings", {
                detail: { section: "model" },
              }),
            );
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
