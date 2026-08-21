import { useEffect, useState } from "react";
import type { ProcessStep, Turn } from "../../types";
import { isProcessBusy, processEntryLabel } from "../../lib/tools";
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
  onToggleStar?: () => void;
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

function legacyThinkAsProcess(think: string): ProcessStep[] {
  const t = think.trim();
  if (!t) return [];
  return [
    {
      id: "legacy-think",
      kind: "think",
      title: "思考",
      status: "ok",
      detail: t,
      summary: t.slice(0, 80),
    },
  ];
}

export default function TurnItem({
  turn,
  onToggleCollapsed,
  onDeepen,
  onDiverge,
  onRegenerate,
  onDelete,
  onToggleStar,
  onMarkClick,
  onAiMouseUp,
  forceExpand,
  railTarget,
}: Props) {
  const bookOn = Boolean(turn.starred);
  /** Local UI toggle; default closed so formal output stays primary (PEL-160). */
  const [processOpen, setProcessOpen] = useState(false);
  const collapsed = forceExpand ? false : turn.collapsed;
  const thinkText = (turn.think ?? "").trim();
  const processSteps: ProcessStep[] =
    turn.process && turn.process.length > 0
      ? turn.process
      : legacyThinkAsProcess(thinkText);
  const showProcess = processSteps.length > 0;
  const processBusy = isProcessBusy(turn.process, thinkText);

  // New turn id → reset closed; never auto-open from store.
  useEffect(() => {
    setProcessOpen(false);
  }, [turn.id]);

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
            data-tip={bookOn ? "取消收藏本轮" : "收藏本轮"}
            aria-label={bookOn ? "取消收藏本轮" : "收藏本轮"}
            aria-pressed={bookOn}
            className={`ic-round${bookOn ? " on" : ""}`}
            onClick={() => onToggleStar?.()}
          >
            <IconBookmark filled={bookOn} />
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

          {showProcess ? (
            <div
              className={`ic-think-wrap ic-process-wrap${processOpen ? " open" : ""}${processBusy ? " busy" : ""}`}
            >
              <button
                type="button"
                className={`ic-think${processOpen ? " open" : ""}`}
                aria-expanded={processOpen}
                aria-controls={`process-${turn.id}`}
                aria-busy={processBusy || undefined}
                data-tip={processOpen ? "收起过程" : "显示过程"}
                onClick={(e) => {
                  e.stopPropagation();
                  setProcessOpen((v) => !v);
                }}
              >
                {processEntryLabel(processSteps, {
                  open: processOpen,
                  busy: processBusy,
                })}{" "}
                <IconChev />
              </button>
              <div
                id={`process-${turn.id}`}
                className={`ic-think-body ic-process-body${processOpen ? " open" : ""}`}
                aria-hidden={!processOpen}
              >
                <ul className="ic-process-list">
                  {processSteps.map((step) => (
                    <li
                      key={step.id}
                      className={`ic-process-step is-${step.status}`}
                    >
                      <div className="ic-process-step-head">
                        <span className="ic-process-step-title">{step.title}</span>
                        {step.summary ? (
                          <span className="ic-process-step-sum">{step.summary}</span>
                        ) : null}
                        <span className="ic-process-step-st" aria-hidden>
                          {step.status === "running"
                            ? "…"
                            : step.status === "ok"
                              ? "✓"
                              : step.status === "error"
                                ? "!"
                                : "–"}
                        </span>
                      </div>
                      {step.detail && step.kind === "think" ? (
                        <div className="ic-process-detail-body">
                          {step.detail}
                        </div>
                      ) : step.detail ? (
                        <details className="ic-process-detail">
                          <summary>详情</summary>
                          <pre className="ic-process-detail-body">
                            {step.detail}
                          </pre>
                        </details>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
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
