import { useMemo } from "react";
import { kindGlyph } from "../../lib/treeNav";
import { UNREAD_RAIL_CAP, useWorkspace } from "../../state/workspaceStore";

type Props = {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

export default function LeftRail({ collapsed = false, onToggleCollapse }: Props) {
  const nodes = useWorkspace((s) => s.nodes);
  const focusId = useWorkspace((s) => s.focusId);
  const recentIds = useWorkspace((s) => s.recentIds);
  const focusNode = useWorkspace((s) => s.focusNode);
  const workspaceMode = useWorkspace((s) => s.workspaceMode);
  const setMode = useWorkspace((s) => s.setWorkspaceMode);
  const source = useWorkspace((s) => s.source);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const unread = useMemo(
    () => nodes.filter((n) => n.unread && n.id !== focusId),
    [nodes, focusId],
  );

  const recent = useMemo(() => {
    const ids = recentIds.length
      ? recentIds
      : focusId
        ? [focusId]
        : [];
    const list: typeof nodes = [];
    const seen = new Set<string>();
    for (const id of ids) {
      const n = byId.get(id);
      if (!n || seen.has(id)) continue;
      seen.add(id);
      list.push(n);
      if (list.length >= 8) break;
    }
    // Fill with other nodes by title if recent is thin
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

          <p className="rail-section-label">最近</p>
          {recent.length === 0 ? (
            <p className="shell-placeholder">尚无探究</p>
          ) : (
            <ul className="node-list">
              {recent.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`${n.id === focusId ? "on" : ""} ${n.unread ? "unread" : ""}`.trim()}
                    onClick={() => {
                      focusNode(n.id);
                      setMode("focus");
                    }}
                  >
                    <span className="node-kind" aria-hidden>
                      {kindGlyph(n.kind)}
                    </span>
                    {n.title}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {unread.length > 0 && (
            <>
              <p className="rail-section-label">未读</p>
              <ul className="node-list">
                {unread.slice(0, UNREAD_RAIL_CAP).map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="unread"
                      onClick={() => {
                        focusNode(n.id);
                        setMode("focus");
                      }}
                    >
                      <span className="node-kind" aria-hidden>
                        {kindGlyph(n.kind)}
                      </span>
                      {n.title}
                    </button>
                  </li>
                ))}
              </ul>
              {unread.length > UNREAD_RAIL_CAP && (
                <p className="rail-more-unread">
                  还有 {unread.length - UNREAD_RAIL_CAP} 条未读 · Ctrl+K
                </p>
              )}
            </>
          )}

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
