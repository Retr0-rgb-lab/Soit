import { useMemo } from "react";
import { LIVE_MAX } from "../../lib/liveSet";
import { kindGlyph } from "../../lib/treeNav";
import { groupUnreadByThread, isInLiveThread } from "../../lib/threadDebt";
import { UNREAD_RAIL_CAP, useWorkspace } from "../../state/workspaceStore";

type Props = {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

export default function LeftRail({ collapsed = false, onToggleCollapse }: Props) {
  const nodes = useWorkspace((s) => s.nodes);
  const focusId = useWorkspace((s) => s.focusId);
  const recentIds = useWorkspace((s) => s.recentIds);
  const liveIds = useWorkspace((s) => s.liveIds);
  const focusNode = useWorkspace((s) => s.focusNode);
  const pinLive = useWorkspace((s) => s.pinLive);
  const unpinLive = useWorkspace((s) => s.unpinLive);
  const markThreadRead = useWorkspace((s) => s.markThreadRead);
  const workspaceMode = useWorkspace((s) => s.workspaceMode);
  const setMode = useWorkspace((s) => s.setWorkspaceMode);
  const source = useWorkspace((s) => s.source);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const debts = useMemo(
    () => groupUnreadByThread(nodes, focusId),
    [nodes, focusId],
  );

  const unreadTotal = useMemo(
    () => nodes.filter((n) => n.unread && n.id !== focusId).length,
    [nodes, focusId],
  );

  const live = useMemo(() => {
    return liveIds
      .map((id) => byId.get(id))
      .filter((n): n is NonNullable<typeof n> => Boolean(n));
  }, [liveIds, byId]);

  const recent = useMemo(() => {
    const ids = recentIds.length ? recentIds : focusId ? [focusId] : [];
    const list: typeof nodes = [];
    const seen = new Set<string>();
    for (const id of ids) {
      const n = byId.get(id);
      if (!n || seen.has(id)) continue;
      seen.add(id);
      list.push(n);
      if (list.length >= 8) break;
    }
    if (list.length < 5) {
      for (const n of nodes) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        list.push(n);
        if (list.length >= 5) break;
      }
    }
    return list;
  }, [recentIds, focusId, byId, nodes]);

  const open = (id: string) => {
    focusNode(id);
    setMode("focus");
  };

  return (
    <aside
      className={`left-rail${collapsed ? " collapsed" : ""}`}
      aria-label="left rail"
    >
      <div className="rail-head">
        <div className="rail-brand">
          <p className="shell-label">Soit</p>
          {!collapsed && <h2 className="shell-title">探究</h2>}
        </div>
        <button
          type="button"
          className="rail-toggle"
          aria-label={collapsed ? "展开左栏" : "折叠左栏"}
          aria-expanded={!collapsed}
          onClick={onToggleCollapse}
          title={collapsed ? "展开" : "折叠"}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {collapsed ? (
        <div className="rail-icon-col">
          <button
            type="button"
            className={`rail-icon-btn${workspaceMode === "map" ? " on" : ""}`}
            title="图谱"
            aria-label="图谱"
            onClick={() =>
              setMode(workspaceMode === "map" ? "focus" : "map")
            }
          >
            ◎
          </button>
          <button
            type="button"
            className="rail-icon-btn"
            title="跳转 Ctrl+K"
            aria-label="跳转卡片"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("soit:open-palette"))
            }
          >
            ⌕
          </button>
        </div>
      ) : (
        <>
          <nav className="rail-nav" aria-label="nav placeholders">
            <button type="button" className="rail-nav-item" disabled>
              宇宙
            </button>
            <button type="button" className="rail-nav-item" disabled>
              vault
            </button>
            <button type="button" className="rail-nav-item" disabled>
              记忆
            </button>
            <button type="button" className="rail-nav-item" disabled>
              技能
            </button>
          </nav>

          <div className="rail-actions">
            <button
              type="button"
              className={`rail-action${workspaceMode === "map" ? " on" : ""}`}
              onClick={() =>
                setMode(workspaceMode === "map" ? "focus" : "map")
              }
            >
              {workspaceMode === "map" ? "返回卡片" : "图谱"}
            </button>
            <button
              type="button"
              className="rail-action ghost"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("soit:open-palette"))
              }
              title="Ctrl+K"
            >
              跳转
            </button>
          </div>

          <div className="rail-scroll">
            <p className="rail-section-label">
              活线 {live.length}/{LIVE_MAX}
            </p>
            {live.length === 0 ? (
              <p className="shell-placeholder">打开卡片会自动进入活线</p>
            ) : (
              <ul className="node-list">
                {live.map((n) => (
                  <li key={n.id} className="rail-live-row">
                    <button
                      type="button"
                      className={`rail-item${n.id === focusId ? " on" : ""}`}
                      onClick={() => open(n.id)}
                      title={n.title}
                    >
                      <span className="node-kind" aria-hidden>
                        {kindGlyph(n.kind)}
                      </span>
                      {n.title}
                    </button>
                    <button
                      type="button"
                      className="rail-mini"
                      title="停养"
                      aria-label={`停养 ${n.title}`}
                      onClick={() => unpinLive(n.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p className="rail-section-label">最近</p>
            {recent.length === 0 ? (
              <p className="shell-placeholder">尚无探究</p>
            ) : (
              <ul className="node-list">
                {recent.map((n) => (
                  <li key={n.id} className="rail-live-row">
                    <button
                      type="button"
                      className={`rail-item${n.id === focusId ? " on" : ""}${n.unread ? " unread" : ""}`.replace(
                        /  +/g,
                        " ",
                      )}
                      onClick={() => open(n.id)}
                      title={n.title}
                    >
                      <span className="node-kind" aria-hidden>
                        {kindGlyph(n.kind)}
                      </span>
                      {n.title}
                    </button>
                    {!isInLiveThread(nodes, liveIds, n.id) && (
                      <button
                        type="button"
                        className="rail-mini"
                        title="钉为活线"
                        aria-label={`钉活 ${n.title}`}
                        onClick={() => pinLive(n.id)}
                      >
                        +
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {debts.length > 0 && (
              <>
                <p className="rail-section-label">
                  线债 · {debts.length} 线 · {unreadTotal} 未读
                </p>
                <ul className="node-list debt-list">
                  {debts.slice(0, UNREAD_RAIL_CAP).map((d) => {
                    const sample = d.sampleIds[0];
                    const sampleNode = sample ? byId.get(sample) : undefined;
                    return (
                      <li key={d.rootId}>
                        <button
                          type="button"
                          className="debt-row"
                          onClick={() => open(sample ?? d.rootId)}
                          title={d.rootTitle}
                        >
                          <span className="debt-title">{d.rootTitle}</span>
                          <span className="debt-count">{d.unreadCount}</span>
                        </button>
                        {sampleNode && (
                          <p className="debt-sample" title={sampleNode.title}>
                            {sampleNode.title}
                          </p>
                        )}
                        <button
                          type="button"
                          className="debt-skim"
                          onClick={() => markThreadRead(d.rootId)}
                        >
                          本线标已读
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {debts.length > UNREAD_RAIL_CAP && (
                  <p className="rail-more-unread">
                    还有 {debts.length - UNREAD_RAIL_CAP} 条线 · Ctrl+K
                  </p>
                )}
              </>
            )}
          </div>

          <p className="rail-foot-meta">
            {source === "demo" ? "Local · demo" : source ?? "—"}
            {" · "}
            {nodes.length} 卡
          </p>
        </>
      )}
    </aside>
  );
}
