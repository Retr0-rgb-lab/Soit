import { useState } from "react";
import type { Turn } from "../../types";
import {
  IconBookmark,
  IconChev,
  IconDeepen,
  IconDiverge,
  IconRefresh,
  IconTrash,
} from "./icons";

interface Props {
  turn: Turn;
  onToggleCollapsed: () => void;
  onDeepen: (label: string) => void;
  onDiverge: (label: string) => void;
  onRegenerate: () => void;
  onDelete: () => void;
  onMarkClick: (term: string, x: number, y: number) => void;
  onAiMouseUp: (e: React.MouseEvent) => void;
}

export default function TurnItem({
  turn,
  onToggleCollapsed,
  onDeepen,
  onDiverge,
  onRegenerate,
  onDelete,
  onMarkClick,
  onAiMouseUp,
}: Props) {
  const [bookOn, setBookOn] = useState(false);
  const [thinkOpen, setThinkOpen] = useState(turn.thinkOpen);
  const collapsed = turn.collapsed;

  const onCollapsedClick = () => {
    if (collapsed) onToggleCollapsed();
  };

  const onMarkPointer = (e: React.MouseEvent) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const mark = t.closest(".mark") as HTMLElement | null;
    if (!mark) return;
    e.preventDefault();
    e.stopPropagation();
    const term = (mark.getAttribute("data-term") || mark.textContent || "").trim();
    if (!term) return;
    onMarkClick(term, e.clientX, e.clientY);
  };

  return (
    <div
      className={`ic-turn${collapsed ? " collapsed" : ""}`}
      data-turn={turn.id}
      onClick={onCollapsedClick}
      role={collapsed ? "button" : undefined}
      tabIndex={collapsed ? 0 : undefined}
      onKeyDown={
        collapsed
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggleCollapsed();
              }
            }
          : undefined
      }
    >
      <div className="ic-turn-top">
        <div className="ic-turn-label">
          {collapsed ? <span className="hint">点击展开 · </span> : null}
          {turn.title}
        </div>
        <div
          className="ic-turn-bar"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="ic-round"
            data-tip="从此轮深挖"
            aria-label="从此轮深挖"
            onClick={() => onDeepen(turn.title)}
          >
            <IconDeepen />
          </button>
          <button
            type="button"
            className="ic-round"
            data-tip="从此轮发散"
            aria-label="从此轮发散"
            onClick={() => onDiverge(turn.title)}
          >
            <IconDiverge />
          </button>
          <button
            type="button"
            className="ic-round"
            data-tip={bookOn ? "取消收藏本轮" : "收藏本轮"}
            aria-label={bookOn ? "取消收藏本轮" : "收藏本轮"}
            onClick={() => setBookOn((v) => !v)}
          >
            <IconBookmark />
          </button>
          <span className="sep" />
          <button
            type="button"
            className="ic-round"
            data-tip="重新生成（卡内重来）"
            aria-label="重新生成"
            onClick={onRegenerate}
          >
            <IconRefresh />
          </button>
          <button
            type="button"
            className="ic-round danger"
            data-tip="删除本轮"
            aria-label="删除本轮"
            onClick={onDelete}
          >
            <IconTrash />
          </button>
        </div>
      </div>

      <div className="ic-turn-body">
        <div className="ic-turn-inner">
          <div className="ic-msg you">{turn.user}</div>

          {turn.think ? (
            <>
              <button
                type="button"
                className={`ic-think${thinkOpen ? " open" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setThinkOpen((v) => !v);
                }}
              >
                思考{thinkOpen ? "收起" : "完成"} <IconChev />
              </button>
              <div className={`ic-think-body${thinkOpen ? " open" : ""}`}>
                <span>{turn.think}</span>
              </div>
            </>
          ) : null}

          <div className="ic-msg ai" data-ai-turn={turn.id}>
            <div
              className="ai-html"
              dangerouslySetInnerHTML={{ __html: turn.aiHtml }}
              onClick={onMarkPointer}
              onMouseUp={onAiMouseUp}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
