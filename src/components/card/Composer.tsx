import { useEffect, useRef } from "react";
import { IconSend } from "./icons";

interface Props {
  draft: string;
  quote: string;
  onDraftChange: (v: string) => void;
  onClearQuote: () => void;
  onSend: () => void;
  disabled?: boolean;
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

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(120, el.scrollHeight)}px`;
  }, [draft]);

  return (
    <div className="ic-dock">
      <button type="button" className="model" data-tip="BYOK / 本地模型">
        Local · demo
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
          placeholder="写在这张卡上…"
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
  );
}
