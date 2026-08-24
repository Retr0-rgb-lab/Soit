import { useMemo } from "react";
import {
  DEFAULT_MAP_CAPS,
  isAggregateId,
  mapConeNodes,
} from "../../lib/mapScope";
import { useWorkspace } from "../../state/workspaceStore";
import GraphCanvas from "./GraphCanvas";

type Props = {
  onExpandMap: () => void;
};

/** Local neighborhood sketch — capped cone tree projection, not a full-graph editor. */
export default function LocusPeek({ onExpandMap }: Props) {
  const nodes = useWorkspace((s) => s.nodes);
  const focusId = useWorkspace((s) => s.focusId);
  const focusNode = useWorkspace((s) => s.focusNode);
  const unread = useMemo(
    () => nodes.filter((n) => n.unread).length,
    [nodes],
  );

  const locus = useMemo(() => {
    const raw = mapConeNodes(nodes, focusId, {
      ...DEFAULT_MAP_CAPS,
      siblingCap: 5,
      childCap: 5,
    });
    // Re-stamp roles from live focusId so highlight never lags the card
    return raw.map((n) => {
      if (n.id === focusId) return { ...n, role: "focus" as const };
      if (n.role === "focus") return { ...n, role: "context" as const };
      return n;
    });
  }, [nodes, focusId]);

  if (locus.length === 0) return null;

  const onSelect = (id: string) => {
    if (isAggregateId(id)) {
      onExpandMap();
      return;
    }
    focusNode(id);
  };

  return (
    <aside className="locus-peek" aria-label="局部结构">
      <div className="locus-peek-head">
        <span className="locus-peek-label">方位</span>
        {unread > 0 && (
          <span className="locus-peek-badge" title={`${unread} 未读`}>
            {unread}
          </span>
        )}
        <button
          type="button"
          className="locus-peek-expand"
          onClick={onExpandMap}
          title="展开图谱 (Ctrl+\\)"
        >
          图谱
        </button>
      </div>
      <GraphCanvas
        nodes={locus}
        focusId={focusId}
        labelMode="none"
        className="locus-graph"
        onSelect={onSelect}
        ariaLabel="局部节点"
      />
    </aside>
  );
}
