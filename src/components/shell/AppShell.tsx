import { useCallback, useEffect, useState } from "react";
import InquiryCard from "../card/InquiryCard";
import CommandPalette from "./CommandPalette";
import EmptyWorkspace from "./EmptyWorkspace";
import LeftRail from "./LeftRail";
import LocusPeek from "./LocusPeek";
import MapStage from "./MapStage";
import ReentryBanner from "./ReentryBanner";
import SettingsPanel, { type SettingsSection } from "./SettingsPanel";
import { useWorkspace } from "../../state/workspaceStore";
import "./settings/settings.css";

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return Boolean(t.closest("[contenteditable='true']"));
}

function parseSettingsSection(raw: unknown): SettingsSection | null {
  if (raw === "space" || raw === "model" || raw === "skills" || raw === "about") {
    return raw;
  }
  return null;
}

export default function AppShell() {
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("space");

  const toggleRail = useCallback(() => {
    setRailCollapsed((v) => !v);
  }, []);

  const openSettings = useCallback((section?: SettingsSection) => {
    if (section) setSettingsSection(section);
    setPaletteOpen(false);
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);

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

  useEffect(() => {
    const onOpen = () => setPaletteOpen(true);
    window.addEventListener("soit:open-palette", onOpen);
    return () => window.removeEventListener("soit:open-palette", onOpen);
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ section?: unknown }>).detail;
      const section = parseSettingsSection(detail?.section) ?? "space";
      openSettings(section);
    };
    window.addEventListener("soit:open-settings", onOpen);
    return () => window.removeEventListener("soit:open-settings", onOpen);
  }, [openSettings]);

  // Compat: legacy skills entry → settings skills section only.
  useEffect(() => {
    const onOpen = () => {
      openSettings("skills");
    };
    window.addEventListener("soit:open-skills", onOpen);
    return () => window.removeEventListener("soit:open-skills", onOpen);
  }, [openSettings]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      // Ctrl/Cmd+, — settings
      if (mod && e.key === ",") {
        e.preventDefault();
        setPaletteOpen(false);
        setSettingsOpen((v) => !v);
        return;
      }
      // Ctrl/Cmd+K — jump to card
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setSettingsOpen(false);
        setPaletteOpen((v) => !v);
        return;
      }
      // Ctrl+B — hide / show floating left rail
      if (mod && (e.key === "b" || e.key === "B") && !e.altKey) {
        e.preventDefault();
        toggleRail();
        return;
      }
      // Ctrl+\ — toggle map (skip when card overlays own the surface)
      if (mod && (e.key === "\\" || e.code === "Backslash")) {
        if (document.querySelector(".ic-float, .ic-selbar, .ic-chooser")) {
          return;
        }
        e.preventDefault();
        setPaletteOpen(false);
        setSettingsOpen(false);
        toggleMap();
        return;
      }
      if (e.key === "Escape") {
        // settings → palette → map
        if (settingsOpen) {
          e.preventDefault();
          setSettingsOpen(false);
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
      // M toggles map when not typing and no card overlay is open
      if (
        !mod &&
        !e.altKey &&
        (e.key === "m" || e.key === "M") &&
        !isTypingTarget(e.target) &&
        !paletteOpen &&
        !settingsOpen &&
        !document.querySelector(".ic-float, .ic-selbar, .ic-chooser")
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
        !settingsOpen &&
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
    settingsOpen,
    workspaceMode,
    setMode,
    toggleMap,
    toggleRail,
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
        onToggleCollapse={toggleRail}
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
      {/* Permanent chrome entry — focus / empty / demo / map */}
      <button
        type="button"
        className={`settings-gear${settingsOpen ? " on" : ""}`}
        aria-label="打开设置"
        aria-expanded={settingsOpen}
        aria-haspopup="dialog"
        title="设置 (Ctrl+,)"
        onClick={() => {
          if (settingsOpen) closeSettings();
          else openSettings();
        }}
      >
        ⚙
      </button>
      <CommandPalette open={paletteOpen} onClose={closePalette} />
      <SettingsPanel
        open={settingsOpen}
        onClose={closeSettings}
        section={settingsSection}
        onSectionChange={setSettingsSection}
      />
    </div>
  );
}
