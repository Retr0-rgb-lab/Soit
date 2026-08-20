import { useState } from "react";
import type { Turn } from "../../types";
import {
  IconBookmark,
  IconChev,
  IconDeepen,
  IconDiverge,
  IconRefresh,
  IconTrash,
  IconTurnCollapse,
  IconTurnExpand,
} from "./icons";

interface Props {
  turn: Turn;
  onToggleCollapsed: () => void;
  onDeepen: (label: string, turnId: string) => void;
  onDiverge: (label: string, turnId: string) => void;
  onRegenerate: () => void;
  onDelete: () => void;
  onMarkClick: (
    term: string,
    x: number,
    y: number,
    meta: { turnId: string; markId?: string },
  ) => void;
  onAiMouseUp: (e: React.MouseEvent, turnId: string) => void;
  /** When true, force-expand so highlight target is visible. */
  forceExpand?: boolean;
  /** History rail selection — soft visual target. */
  railTarget?: boolean;
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
  forceExpand,
  railTarget,
}: Props) {
  const [bookOn, setBookOn] = useState(false);
  const [thinkOpen, setThinkOpen] = useState(turn.thinkOpen);
  const collapsed = forceExpand ? false : turn.collapsed;

  const onMarkPointer = (e: React.MouseEvent) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const mark = t.closest(".mark") as HTMLElement | null;
    if (!mark) return;
    e.preventDefault();
    e.stopPropagation();
    const term = (mark.getAttribute("data-term") || mark.textContent || "").trim();
    if (!term) return;
    const markId =
      mark.getAttribute("data-mark-id") ||
      mark.getAttribute("data-term") ||
      undefined;
    onMarkClick(term, e.clientX, e.clientY, { turnId: turn.id, markId });
  };

  return (
    <div
      className={`ic-turn${collapsed ? " collapsed" : ""}${railTarget ? " rail-target" : ""}`}
      data-turn={turn.id}
    >
      <div className="ic-turn-top">
        <div className="ic-turn-label">
          <button
            type="button"
            className="ic-turn-toggle"
            data-tip={collapsed ? "展开本轮" : "收起本轮"}
            aria-label={collapsed ? `展开：${turn.title}` : `收起：${turn.title}`}
            aria-expanded={!collapsed}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapsed();
            }}
          >
            {collapsed ? <IconTurnExpand /> : <IconTurnCollapse />}
          </button>
          <span className="ic-turn-title">{turn.title}</span>
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
            onClick={() => onDeepen(turn.title, turn.id)}
          >
            <IconDeepen />
          </button>
          <button
            type="button"
            className="ic-round"
            data-tip="从此轮发散"
            aria-label="从此轮发散"
            onClick={() => onDiverge(turn.title, turn.id)}
          >
            <IconDiverge />
          </button>
          <button
            type="button"
            className="ic-round"
            data-tip={bookOn ? "取消钉住本轮（仅本会话）" : "钉住本轮（仅本会话）"}
            aria-label={bookOn ? "取消钉住本轮" : "钉住本轮"}
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
              data-turn-id={turn.id}
              dangerouslySetInnerHTML={{ __html: turn.aiHtml }}
              onClick={onMarkPointer}
              onMouseUp={(e) => onAiMouseUp(e, turn.id)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
