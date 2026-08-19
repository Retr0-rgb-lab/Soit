import { useCallback, useEffect, useState } from "react";
import InquiryCard from "../card/InquiryCard";
import CommandPalette from "./CommandPalette";
import EmptyWorkspace from "./EmptyWorkspace";
import LeftRail from "./LeftRail";
import LocusPeek from "./LocusPeek";
import MapStage from "./MapStage";
import ReentryBanner from "./ReentryBanner";
import SkillsPanel from "./SkillsPanel";
import { useWorkspace } from "../../state/workspaceStore";

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return Boolean(t.closest("[contenteditable='true']"));
}

export default function AppShell() {
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);

  const workspaceMode = useWorkspace((s) => s.workspaceMode);
  const setMode = useWorkspace((s) => s.setWorkspaceMode);
  const toggleMap = useWorkspace((s) => s.toggleMapMode);
  const focusId = useWorkspace((s) => s.focusId);
  const nodes = useWorkspace((s) => s.nodes);
  const source = useWorkspace((s) => s.source);
  const focusNode = useWorkspace((s) => s.focusNode);

  const showEmpty =
    source === "empty" ||
    (source === "universe" && nodes.length === 0) ||
    (source !== "demo" && source !== null && !focusId);

  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const closeSkills = useCallback(() => setSkillsOpen(false), []);

  useEffect(() => {
    const onOpen = () => setPaletteOpen(true);
    window.addEventListener("soit:open-palette", onOpen);
    return () => window.removeEventListener("soit:open-palette", onOpen);
  }, []);

  useEffect(() => {
    const onOpen = () => {
      setPaletteOpen(false);
      setSkillsOpen(true);
    };
    window.addEventListener("soit:open-skills", onOpen);
    return () => window.removeEventListener("soit:open-skills", onOpen);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      // Ctrl/Cmd+K — jump to card
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setSkillsOpen(false);
        setPaletteOpen((v) => !v);
        return;
      }
      // Ctrl+\ — toggle map
      if (mod && (e.key === "\\" || e.code === "Backslash")) {
        e.preventDefault();
        setPaletteOpen(false);
        setSkillsOpen(false);
        toggleMap();
        return;
      }
      if (e.key === "Escape") {
        if (skillsOpen) {
          e.preventDefault();
          setSkillsOpen(false);
          return;
        }
        if (paletteOpen) {
          e.preventDefault();
          setPaletteOpen(false);
          return;
        }
        if (workspaceMode === "map") {
          e.preventDefault();
          setMode("focus");
          return;
        }
      }
      // M toggles map when not typing
      if (
        !mod &&
        !e.altKey &&
        (e.key === "m" || e.key === "M") &&
        !isTypingTarget(e.target) &&
        !paletteOpen &&
        !skillsOpen
      ) {
        e.preventDefault();
        toggleMap();
        return;
      }

      // Alt+arrows: tree walk in focus mode
      if (
        e.altKey &&
        !mod &&
        workspaceMode === "focus" &&
        !paletteOpen &&
        !skillsOpen &&
        !isTypingTarget(e.target)
      ) {
        const byId = new Map(nodes.map((n) => [n.id, n]));
        const cur = byId.get(focusId);
        if (!cur) return;
        if (e.key === "ArrowUp") {
          e.preventDefault();
          if (cur.parentId && byId.has(cur.parentId)) focusNode(cur.parentId);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const child = nodes.find((n) => n.parentId === focusId);
          if (child) focusNode(child.id);
          return;
        }
        if (e.key === "[" || e.key === "ArrowLeft") {
          e.preventDefault();
          if (!cur.parentId) return;
          const sibs = nodes.filter((n) => n.parentId === cur.parentId);
          const i = sibs.findIndex((n) => n.id === focusId);
          if (i > 0) focusNode(sibs[i - 1]!.id);
          else if (sibs.length) focusNode(sibs[sibs.length - 1]!.id);
          return;
        }
        if (e.key === "]" || e.key === "ArrowRight") {
          e.preventDefault();
          if (!cur.parentId) return;
          const sibs = nodes.filter((n) => n.parentId === cur.parentId);
          const i = sibs.findIndex((n) => n.id === focusId);
          if (i >= 0 && i < sibs.length - 1) focusNode(sibs[i + 1]!.id);
          else if (sibs.length) focusNode(sibs[0]!.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    paletteOpen,
    skillsOpen,
    workspaceMode,
    setMode,
    toggleMap,
    nodes,
    focusId,
    focusNode,
  ]);

  return (
    <div
      className={`app-shell${railCollapsed ? " rail-collapsed" : ""}${workspaceMode === "map" ? " mode-map" : " mode-focus"}`}
    >
      <LeftRail
        collapsed={railCollapsed}
        onToggleCollapse={() => setRailCollapsed((v) => !v)}
      />
      <div className="workspace-main">
        {workspaceMode === "map" ? (
          <MapStage onClose={() => setMode("focus")} />
        ) : showEmpty ? (
          <main className="center-stage" aria-label="empty workspace">
            <EmptyWorkspace />
          </main>
        ) : (
          <>
            <main className="center-stage" aria-label="inquiry card">
              <ReentryBanner />
              <InquiryCard />
            </main>
            <LocusPeek onExpandMap={() => setMode("map")} />
          </>
        )}
      </div>
      <CommandPalette open={paletteOpen} onClose={closePalette} />
      <SkillsPanel open={skillsOpen} onClose={closeSkills} />
    </div>
  );
}
