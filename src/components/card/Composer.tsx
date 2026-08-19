import { useEffect, useRef } from "react";
import { useWorkspace } from "../../state/workspaceStore";
import type { SnapshotSource } from "../../types";
import { IconSend } from "./icons";

interface Props {
  draft: string;
  quote: string;
  onDraftChange: (v: string) => void;
  onClearQuote: () => void;
  onSend: () => void;
  disabled?: boolean;
}

/** Workspace-source chip only — no ChatPort / model plumbing yet. */
function sourceChipLabel(source: SnapshotSource | null): string {
  if (source === "demo") return "演示数据";
  if (source === "empty") return "本库 · 空";
  if (source === "universe") return "本库";
  return "未绑定";
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
  const source = useWorkspace((s) => s.source);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(120, el.scrollHeight)}px`;
  }, [draft]);

  return (
    <div className="ic-dock">
      <button
        type="button"
        className="model"
        data-tip="工作区来源（模型接入未接 ChatPort）"
      >
        {sourceChipLabel(source)}
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
