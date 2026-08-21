import { stripHtml } from "../../lib/chat/port";
import { useWorkspace } from "../../state/workspaceStore";
import "./MaterialsRail.css";

function excerptOf(user: string, aiHtml: string): string {
  const u = user.trim().replace(/\s+/g, " ");
  if (u) return u.slice(0, 80);
  const plain = stripHtml(aiHtml).trim().replace(/\s+/g, " ");
  return plain.slice(0, 80);
}

/** Right-pane catalog of starred turns — jump to card, no second chat surface. */
export default function StarsCatalog() {
  const nodes = useWorkspace((s) => s.nodes);
  const turnsByCardId = useWorkspace((s) => s.turnsByCardId);
  const closeMaterialsRail = useWorkspace((s) => s.closeMaterialsRail);
  const setCompanionSection = useWorkspace((s) => s.setCompanionSection);
  const jumpToStarredTurn = useWorkspace((s) => s.jumpToStarredTurn);
  const setTurnStarred = useWorkspace((s) => s.setTurnStarred);
  const highlightSpan = useWorkspace((s) => s.highlightSpan);

  const items = nodes.flatMap((n) => {
    const turns = turnsByCardId[n.id] ?? [];
    return turns
      .filter((t) => t.starred)
      .map((t) => ({
        turnId: t.id,
        cardId: n.id,
        cardTitle: n.title,
        turnTitle: t.title,
        excerpt: excerptOf(t.user, t.aiHtml),
      }));
  });

  return (
    <aside className="materials-pane is-embedded" aria-label="收藏">
      <header className="materials-pane__head">
        <nav className="companion-tabs" aria-label="右侧栏模块">
          <button
            type="button"
            className="companion-tabs__btn"
            onClick={() => setCompanionSection("materials")}
          >
            资料
          </button>
          <button
            type="button"
            className="companion-tabs__btn is-on"
            aria-current="page"
          >
            收藏
          </button>
        </nav>
        <div className="materials-pane__actions">
          <button
            type="button"
            className="materials-pane__btn materials-pane__btn--close"
            onClick={closeMaterialsRail}
            aria-label="关闭"
            title="关闭"
          >
            ×
          </button>
        </div>
      </header>
      <div className="materials-pane__body">
        {items.length === 0 ? (
          <div className="materials-pane__empty">
            <p>还没有收藏的轮次</p>
            <p className="materials-pane__hint">
              在一轮上点书签，会出现在这里。点击条目会跳回那张卡片。
            </p>
          </div>
        ) : (
          <ul className="materials-pane__list" aria-label="收藏的轮次">
            {items.map((it) => {
              const on = highlightSpan?.turnId === it.turnId;
              return (
                <li key={it.turnId} className="stars-catalog__row">
                  <button
                    type="button"
                    className={`materials-pane__item${on ? " is-selected" : ""}`}
                    onClick={() => jumpToStarredTurn(it.cardId, it.turnId)}
                  >
                    <span className="materials-pane__kind" aria-hidden>
                      轮
                    </span>
                    <span className="materials-pane__name">
                      {it.cardTitle}
                      {it.turnTitle ? ` · ${it.turnTitle}` : ""}
                      {it.excerpt ? (
                        <span className="materials-pane__hint">
                          {" "}
                          {it.excerpt}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="materials-pane__btn"
                    title="取消收藏"
                    aria-label={`取消收藏 ${it.turnTitle || it.cardTitle}`}
                    onClick={() => void setTurnStarred(it.turnId, false, it.cardId)}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
