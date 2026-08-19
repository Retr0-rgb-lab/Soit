import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_MAP_CAPS,
  EXPAND_STEP,
  isAggregateId,
  mapAtlasNodes,
  mapConeNodes,
  mapGrowthNodes,
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
  growth: "本次生长",
  atlas: "总览",
};

const SCOPES: MapScopeMode[] = ["working", "cone", "growth", "atlas"];

export default function MapStage({ onClose }: Props) {
  const nodes = useWorkspace((s) => s.nodes);
  const focusId = useWorkspace((s) => s.focusId);
  const recentIds = useWorkspace((s) => s.recentIds);
  const sessionTouchIds = useWorkspace((s) => s.sessionTouchIds);
  const focusNode = useWorkspace((s) => s.focusNode);
  const mapScopeMode = useWorkspace((s) => s.mapScopeMode);
  const setMapScopeMode = useWorkspace((s) => s.setMapScopeMode);
  const loadSnapshot = useWorkspace((s) => s.loadSnapshot);

  const [expanded, setExpanded] = useState<ExpandedCaps>({});
  const [fitToken, setFitToken] = useState(0);
  const [fitMode, setFitMode] = useState<"all" | "focus">("all");
  const [cursor, setCursor] = useState(focusId);

  const views = useMemo(() => {
    if (mapScopeMode === "cone") {
      return mapConeNodes(nodes, focusId, DEFAULT_MAP_CAPS, expanded);
    }
    if (mapScopeMode === "atlas") {
      return mapAtlasNodes(nodes, focusId, DEFAULT_MAP_CAPS);
    }
    if (mapScopeMode === "growth") {
      return mapGrowthNodes(
        nodes,
        focusId,
        sessionTouchIds,
        DEFAULT_MAP_CAPS,
        expanded,
      );
    }
    return mapWorkingNodes(
      nodes,
      focusId,
      recentIds,
      DEFAULT_MAP_CAPS,
      expanded,
    );
  }, [
    nodes,
    focusId,
    recentIds,
    sessionTouchIds,
    mapScopeMode,
    expanded,
  ]);

  const realViews = useMemo(
    () => views.filter((v) => !isAggregateId(v.id)),
    [views],
  );

  useEffect(() => {
    setCursor(focusId);
    // Refit when scope or graph data changes so nodes aren't clipped
    setFitToken((n) => n + 1);
  }, [focusId, mapScopeMode, views.length]);

  // Map keyboard: move among visible real nodes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const t = e.target.tagName;
        if (t === "INPUT" || t === "TEXTAREA") return;
      }
      if (e.key === "f" || e.key === "F") {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          setFitMode("focus");
          setFitToken((n) => n + 1);
        }
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        setFitMode("all");
        setFitToken((n) => n + 1);
        return;
      }
      const ids = realViews.map((v) => v.id);
      if (!ids.length) return;
      let i = Math.max(0, ids.indexOf(cursor));
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowDown" || e.key === "j" || e.key === "J") {
        e.preventDefault();
        i = (i + 1) % ids.length;
        setCursor(ids[i]!);
        return;
      }
      if (e.key === "ArrowUp" || e.key === "k" || e.key === "K") {
        e.preventDefault();
        i = (i - 1 + ids.length) % ids.length;
        setCursor(ids[i]!);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const id = ids[i] ?? cursor;
        if (id) {
          focusNode(id);
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [realViews, cursor, focusNode, onClose]);

  const focus = nodes.find((n) => n.id === focusId);
  const unread = nodes.filter((n) => n.unread).length;
  const highlightId = cursor || focusId;

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
      setFitToken((n) => n + 1);
      return;
    }
    focusNode(id);
    onClose();
  };

  return (
    <section
      className="map-stage"
      aria-label={`探究图谱（${SCOPE_LABEL[mapScopeMode]}）`}
    >
      <header className="map-stage-bar">
        <div className="map-stage-titles">
          <p className="shell-label">图谱</p>
          <h2 className="map-stage-title">
            {SCOPE_LABEL[mapScopeMode]} {views.length} · 库 {nodes.length}
            {focus ? ` · ${focus.title}` : ""}
          </h2>
          <p className="shell-meta">
            {unread > 0 ? `${unread} 未读 · ` : ""}
            拖拽平移 · 滚轮缩放 · F 跟焦 · 0 全览 · ↑↓ 浏览 · Enter 打开
          </p>
          <div className="map-scope-tabs" role="tablist" aria-label="图谱范围">
            {SCOPES.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mapScopeMode === m}
                className={`map-scope-tab${mapScopeMode === m ? " on" : ""}`}
                onClick={() => {
                  setMapScopeMode(m);
                  setExpanded({});
                  setFitToken((n) => n + 1);
                }}
              >
                {SCOPE_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="map-stage-actions">
          <button
            type="button"
            className="map-btn ghost"
            onClick={() => {
              setFitMode("focus");
              setFitToken((n) => n + 1);
            }}
            title="F"
          >
            跟焦
          </button>
          <button
            type="button"
            className="map-btn ghost"
            onClick={() => {
              setFitMode("all");
              setFitToken((n) => n + 1);
            }}
            title="0"
          >
            全览
          </button>
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
          focusId={highlightId}
          labelMode="lod"
          panZoom
          fitToken={fitToken}
          fitMode={fitMode}
          className="map-graph"
          onSelect={openCard}
          ariaLabel={`探究图谱 ${SCOPE_LABEL[mapScopeMode]}`}
        />
      </div>
    </section>
  );
}
