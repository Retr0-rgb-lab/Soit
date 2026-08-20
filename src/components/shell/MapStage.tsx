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
  /** Tree projection / structure overview — not an editable “思维宇宙”. */
  atlas: "结构总览",
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
    let raw;
    if (mapScopeMode === "cone") {
      raw = mapConeNodes(nodes, focusId, DEFAULT_MAP_CAPS, expanded);
    } else if (mapScopeMode === "atlas") {
      raw = mapAtlasNodes(nodes, focusId, DEFAULT_MAP_CAPS);
    } else if (mapScopeMode === "growth") {
      raw = mapGrowthNodes(
        nodes,
        focusId,
        sessionTouchIds,
        DEFAULT_MAP_CAPS,
        expanded,
      );
    } else {
      raw = mapWorkingNodes(
        nodes,
        focusId,
        recentIds,
        DEFAULT_MAP_CAPS,
        expanded,
      );
    }
    // Stamp roles from the live highlight target (cursor may lead focus on map)
    return raw;
  }, [
    nodes,
    focusId,
    recentIds,
    sessionTouchIds,
    mapScopeMode,
    expanded,
  ]);

  /** Roles + black node follow keyboard cursor while browsing map; lock to focusId after open. */
  const painted = useMemo(() => {
    const hid = cursor || focusId;
    return views.map((n) => {
      if (n.id === hid) return { ...n, role: "focus" as const };
      if (n.role === "focus") return { ...n, role: "context" as const };
      return n;
    });
  }, [views, cursor, focusId]);

  const realViews = useMemo(
    () => painted.filter((v) => !isAggregateId(v.id)),
    [painted],
  );

  useEffect(() => {
    setCursor(focusId);
    // Refit when scope or graph data changes so nodes aren't clipped
    setFitToken((n) => n + 1);
  }, [focusId, mapScopeMode, views.length]);

  // Map keyboard: move among visible real nodes (skip when typing or modal open)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const t = e.target;
        const tag = t.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          t.isContentEditable ||
          t.closest("[contenteditable='true']") ||
          t.closest("[role='dialog']") ||
          t.closest(".cmd-palette") ||
          t.closest(".skills-panel")
        ) {
          return;
        }
      }
      // Palette/skills may be open without focus inside dialog yet
      if (
        document.querySelector(".cmd-palette-root, [data-cmd-palette]") ||
        document.querySelector(".skills-panel-root")
      ) {
        return;
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
    // Keep graph highlight and store focus in lockstep
    setCursor(id);
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
            {mapScopeMode === "atlas"
              ? "探究树投影 · 非可编辑空间 · "
              : ""}
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
          {highlightId && !isAggregateId(highlightId) && (
            <button
              type="button"
              className="map-btn primary"
              onClick={() => openCard(highlightId)}
            >
              打开当前
            </button>
          )}
        </div>
      </header>

      {import.meta.env.DEV && (
        <div
          className="map-dev-stress"
          aria-label="开发压测种子（仅 DEV，会替换当前图）"
          title="仅开发环境：注入压测树以验证 LOD / 聚合，非产品功能"
        >
          <span className="shell-label">DEV 压测 · 替换当前图</span>
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
          nodes={painted}
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
