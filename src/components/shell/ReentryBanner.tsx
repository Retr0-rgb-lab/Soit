import { useWorkspace } from "../../state/workspaceStore";

/** Cold / resume orientation strip — not a full map. */
export default function ReentryBanner() {
  const nodes = useWorkspace((s) => s.nodes);
  const focusId = useWorkspace((s) => s.focusId);
  const resumeHintId = useWorkspace((s) => s.resumeHintId);
  const dismissed = useWorkspace((s) => s.reentryDismissed);
  const dismiss = useWorkspace((s) => s.dismissReentry);
  const focusNode = useWorkspace((s) => s.focusNode);
  const setMode = useWorkspace((s) => s.setWorkspaceMode);
  const liveIds = useWorkspace((s) => s.liveIds);
  const unread = nodes.filter((n) => n.unread).length;

  if (dismissed) return null;

  const focus = nodes.find((n) => n.id === focusId);
  if (!focus) return null;

  const hint =
    resumeHintId && resumeHintId !== focusId
      ? nodes.find((n) => n.id === resumeHintId)
      : null;

  return (
    <div className="reentry-banner" role="region" aria-label="继续探究">
      <div className="reentry-main">
        <p className="reentry-kicker">继续</p>
        <p className="reentry-title">
          你在：<strong>{focus.title}</strong>
          {unread > 0 ? ` · ${unread} 未读` : ""}
          {liveIds.length > 0 ? ` · ${liveIds.length} 条活线` : ""}
        </p>
        {hint && (
          <p className="reentry-hint">
            也可回到上一张：
            <button type="button" onClick={() => focusNode(hint.id)}>
              {hint.title}
            </button>
          </p>
        )}
      </div>
      <div className="reentry-actions">
        <button
          type="button"
          className="map-btn primary"
          onClick={() => dismiss()}
        >
          从这里继续
        </button>
        <button
          type="button"
          className="map-btn ghost"
          onClick={() => {
            setMode("map");
            dismiss();
          }}
        >
          看结构
        </button>
        <button
          type="button"
          className="map-btn ghost"
          onClick={() => dismiss()}
          aria-label="关闭"
        >
          ×
        </button>
      </div>
    </div>
  );
}
