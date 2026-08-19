import { useMemo, useState } from "react";
import {
  DEFAULT_MAP_CAPS,
  EXPAND_STEP,
  isAggregateId,
  mapAtlasNodes,
  mapConeNodes,
  mapWorkingNodes,
  parseAggregateKey,
  type ExpandedCaps,
  type MapScopeMode,
} from "../../lib/mapScope";
import {
  stressBushy,
  stressDeep,
  stressFan,
  stressMixed,
} from "../../lib/stressSeed";
import { useWorkspace } from "../../state/workspaceStore";
import GraphCanvas from "./GraphCanvas";

type Props = {
  onClose: () => void;
};

const SCOPE_LABEL: Record<MapScopeMode, string> = {
  working: "工作集",
  cone: "焦点锥",
  atlas: "总览",
};

export default function MapStage({ onClose }: Props) {
  const nodes = useWorkspace((s) => s.nodes);
  const focusId = useWorkspace((s) => s.focusId);
  const recentIds = useWorkspace((s) => s.recentIds);
  const focusNode = useWorkspace((s) => s.focusNode);
  const mapScopeMode = useWorkspace((s) => s.mapScopeMode);
  const setMapScopeMode = useWorkspace((s) => s.setMapScopeMode);
  const loadSnapshot = useWorkspace((s) => s.loadSnapshot);

  const [expanded, setExpanded] = useState<ExpandedCaps>({});

  const views = useMemo(() => {
    if (mapScopeMode === "cone") {
      return mapConeNodes(nodes, focusId, DEFAULT_MAP_CAPS, expanded);
    }
    if (mapScopeMode === "atlas") {
      return mapAtlasNodes(nodes, focusId, DEFAULT_MAP_CAPS);
    }
    return mapWorkingNodes(
      nodes,
      focusId,
      recentIds,
      DEFAULT_MAP_CAPS,
      expanded,
    );
  }, [nodes, focusId, recentIds, mapScopeMode, expanded]);

  const focus = nodes.find((n) => n.id === focusId);
  const unread = nodes.filter((n) => n.unread).length;

  const openCard = (id: string) => {
    if (isAggregateId(id)) {
      const parsed = parseAggregateKey(id);
      if (!parsed) return;
      const key = `${parsed.parentId}:${parsed.group}`;
      setExpanded((prev) => {
        const cur =
          prev[key] ??
          (parsed.group === "child"
            ? DEFAULT_MAP_CAPS.childCap
            : DEFAULT_MAP_CAPS.siblingCap);
        return { ...prev, [key]: cur + EXPAND_STEP };
      });
      return;
    }
    focusNode(id);
    onClose();
  };

  return (
    <section className="map-stage" aria-label={`探究图谱（${SCOPE_LABEL[mapScopeMode]}）`}>
      <header className="map-stage-bar">
        <div className="map-stage-titles">
          <p className="shell-label">图谱</p>
          <h2 className="map-stage-title">
            {SCOPE_LABEL[mapScopeMode]} {views.length} · 库 {nodes.length}
            {focus ? ` · ${focus.title}` : ""}
          </h2>
          <p className="shell-meta">
            {unread > 0 ? `${unread} 未读 · ` : ""}
            点节点打开 · 点聚合展开 · Esc 返回
          </p>
          <div className="map-scope-tabs" role="tablist" aria-label="图谱范围">
            {(["working", "cone", "atlas"] as MapScopeMode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mapScopeMode === m}
                className={`map-scope-tab${mapScopeMode === m ? " on" : ""}`}
                onClick={() => {
                  setMapScopeMode(m);
                  setExpanded({});
                }}
              >
                {SCOPE_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="map-stage-actions">
          <button type="button" className="map-btn ghost" onClick={onClose}>
            返回卡片
          </button>
          {focus && (
            <button
              type="button"
              className="map-btn primary"
              onClick={() => openCard(focus.id)}
            >
              打开当前
            </button>
          )}
        </div>
      </header>

      {import.meta.env.DEV && (
        <div className="map-dev-stress" aria-label="压测种子">
          <span className="shell-label">DEV 压测</span>
          <button type="button" onClick={() => loadSnapshot(stressFan(80))}>
            fan80
          </button>
          <button type="button" onClick={() => loadSnapshot(stressDeep(40))}>
            deep40
          </button>
          <button type="button" onClick={() => loadSnapshot(stressBushy(100))}>
            bushy100
          </button>
          <button type="button" onClick={() => loadSnapshot(stressMixed(100))}>
            mixed100
          </button>
        </div>
      )}

      <div className="map-stage-canvas">
        <GraphCanvas
          nodes={views}
          focusId={focusId}
          labelMode="lod"
          className="map-graph"
          onSelect={openCard}
          ariaLabel={`探究图谱 ${SCOPE_LABEL[mapScopeMode]}`}
        />
      </div>
    </section>
  );
}
