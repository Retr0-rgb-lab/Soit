import { useCallback, useEffect, useState } from "react";
import InquiryCard from "../card/InquiryCard";
import OpenDocPopover from "../doc/OpenDocPopover";
import CommandPalette from "./CommandPalette";
import CompanionPane from "./CompanionPane";
import EmptyWorkspace from "./EmptyWorkspace";
import LeftRail from "./LeftRail";
import OrbitStage from "./OrbitStage";
import WorkspaceSplit, { COMPANION_ANIM_MS } from "./SplitSash";
import SettingsPanel, { type SettingsSection } from "./SettingsPanel";
import { useWorkspace } from "../../state/workspaceStore";
import "./settings/settings.css";

/** Card exit duration before orbit mounts alone on the paper bg (ms). */
const CARD_EXIT_MS = 320;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return Boolean(t.closest("[contenteditable='true']"));
}

function parseSettingsSection(raw: unknown): SettingsSection | null {
  if (
    raw === "space" ||
    raw === "appearance" ||
    raw === "model" ||
    raw === "tools" ||
    raw === "runtime" ||
    raw === "skills" ||
    raw === "about"
  ) {
    return raw;
  }
  return null;
}

function isDocSurfaceOpen(status: string): boolean {
  return (
    status === "loading" ||
    status === "ready" ||
    status === "error" ||
    status === "closing"
  );
}

export default function AppShell() {
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("space");
  const [openDocOpen, setOpenDocOpen] = useState(false);
  /**
   * Global orbit surface ownership (AGENTS hard rule):
   * - cardExiting: card alone fades down on paper bg (orbit not mounted yet)
   * - orbitLive: card unmounted; orbit is the only main surface on paper bg
   * Never mount orbit while the card is still in the tree under it.
   */
  const [cardExiting, setCardExiting] = useState(false);
  const [orbitLive, setOrbitLive] = useState(false);

  const toggleRail = useCallback(() => {
    setRailCollapsed((v) => !v);
  }, []);

  const openSettings = useCallback((section?: SettingsSection) => {
    if (section) setSettingsSection(section);
    setPaletteOpen(false);
    setOpenDocOpen(false);
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
  const docSession = useWorkspace((s) => s.docSession);
  const closeDoc = useWorkspace((s) => s.closeDoc);
  const materialsOpen = useWorkspace((s) => s.materialsRail.open);
  const openMaterialsRail = useWorkspace((s) => s.openMaterialsRail);
  const closeMaterialsRail = useWorkspace((s) => s.closeMaterialsRail);
  const toggleMaterialsRail = useWorkspace((s) => s.toggleMaterialsRail);

  // Clean product: no silent demo cards — empty graph → EmptyWorkspace.
  const showEmpty =
    source !== null &&
    (nodes.length === 0 ||
      source === "empty" ||
      !focusId);

  const docOpen = isDocSurfaceOpen(docSession.status);
  const docLayout = docSession.layout;
  const isPeek = docOpen && docLayout === "peek" && !materialsOpen;
  /** Store wants companion visible (list or preview). */
  const companionTarget =
    (materialsOpen || docOpen) && !isPeek && workspaceMode === "focus";
  /**
   * Mount lags close so width can animate out.
   * `companionExpanded` drives CSS open class (true after rAF on open).
   */
  const [companionMounted, setCompanionMounted] = useState(false);
  const [companionExpanded, setCompanionExpanded] = useState(false);

  useEffect(() => {
    if (companionTarget) {
      setCompanionMounted(true);
      const reduced = prefersReducedMotion();
      if (reduced) {
        setCompanionExpanded(true);
        return;
      }
      let raf2 = 0;
      const raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => setCompanionExpanded(true));
      });
      return () => {
        window.cancelAnimationFrame(raf1);
        window.cancelAnimationFrame(raf2);
      };
    }
    // Close: collapse first, then unmount after anim.
    setCompanionExpanded(false);
    if (!companionMounted) return;
    const ms = prefersReducedMotion() ? 0 : COMPANION_ANIM_MS;
    const t = window.setTimeout(() => setCompanionMounted(false), ms);
    return () => window.clearTimeout(t);
  }, [companionTarget, companionMounted]);

  const useSplit = companionMounted && !showEmpty;

  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const closeOpenDoc = useCallback(() => setOpenDocOpen(false), []);

  // Enter map: card exits alone → then orbit mounts on empty paper (never over card).
  // Leave map: drop orbit immediately; card returns as sole main surface.
  useEffect(() => {
    if (showEmpty) {
      setCardExiting(false);
      setOrbitLive(false);
      return;
    }
    if (workspaceMode === "map") {
      if (orbitLive) return;
      setCardExiting(true);
      setOrbitLive(false);
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const ms = reduced ? 40 : CARD_EXIT_MS;
      const t = window.setTimeout(() => {
        setCardExiting(false);
        setOrbitLive(true);
      }, ms);
      return () => window.clearTimeout(t);
    }
    setCardExiting(false);
    setOrbitLive(false);
  }, [workspaceMode, showEmpty, orbitLive]);

  useEffect(() => {
    const onOpen = () => setPaletteOpen(true);
    window.addEventListener("soit:open-palette", onOpen);
    return () => window.removeEventListener("soit:open-palette", onOpen);
  }, []);

  useEffect(() => {
    const onOpen = () => {
      setSettingsOpen(false);
      setPaletteOpen(false);
      setOpenDocOpen(true);
    };
    window.addEventListener("soit:open-doc", onOpen);
    return () => window.removeEventListener("soit:open-doc", onOpen);
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
    const onToggle = () => toggleMaterialsRail();
    const onOpen = () => openMaterialsRail();
    window.addEventListener("soit:toggle-materials", onToggle);
    window.addEventListener("soit:open-materials", onOpen);
    return () => {
      window.removeEventListener("soit:toggle-materials", onToggle);
      window.removeEventListener("soit:open-materials", onOpen);
    };
  }, [toggleMaterialsRail, openMaterialsRail]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      // Ctrl/Cmd+, — settings (does not force-close materials rail)
      if (mod && e.key === ",") {
        e.preventDefault();
        setPaletteOpen(false);
        setOpenDocOpen(false);
        setSettingsOpen((v) => !v);
        return;
      }
      // Ctrl/Cmd+K — jump to card (does not force-close materials rail)
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setSettingsOpen(false);
        setOpenDocOpen(false);
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
        setOpenDocOpen(false);
        toggleMap();
        return;
      }
      if (e.key === "Escape") {
        // settings → palette → open-doc → materials rail → doc → map→focus
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
        if (openDocOpen) {
          e.preventDefault();
          setOpenDocOpen(false);
          return;
        }
        if (materialsOpen) {
          e.preventDefault();
          closeMaterialsRail();
          return;
        }
        if (docOpen) {
          e.preventDefault();
          closeDoc();
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
        !openDocOpen &&
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
        !openDocOpen &&
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
    openDocOpen,
    materialsOpen,
    closeMaterialsRail,
    docOpen,
    closeDoc,
    workspaceMode,
    setMode,
    toggleMap,
    toggleRail,
    nodes,
    focusId,
    focusNode,
  ]);

  const renderFocusMain = () => {
    // Empty + companion → full-width list/preview; empty alone → EmptyWorkspace
    if (showEmpty) {
      if (companionMounted) {
        return (
          <main
            className={`center-stage companion-full${companionExpanded ? " is-companion-open" : ""}`}
            aria-label="资料"
          >
            <div className="companion-full-slot">
              <CompanionPane />
            </div>
          </main>
        );
      }
      return (
        <main className="center-stage" aria-label="empty workspace">
          <EmptyWorkspace />
        </main>
      );
    }

    // Map transition / orbit — never mount companion with Orbit.
    if (orbitLive) {
      return (
        <OrbitStage
          onClose={() => setMode("focus")}
          onPick={(id) => {
            focusNode(id);
            setMode("focus");
          }}
        />
      );
    }

    const card = (
      <main
        className={`center-stage${cardExiting ? " is-map-exit" : ""}`}
        aria-label="inquiry card"
        aria-hidden={cardExiting || undefined}
      >
        <InquiryCard />
      </main>
    );

    // Peek only when materials closed (legacy overlay path).
    if (isPeek) {
      return (
        <>
          {card}
          <CompanionPane />
        </>
      );
    }

    // Card | sash | companion (list XOR preview in one slot) — anim open/close
    if (useSplit) {
      return (
        <WorkspaceSplit
          layout={docLayout === "doc-wide" ? "doc-wide" : "split"}
          card={card}
          doc={<CompanionPane />}
          expanded={companionExpanded}
        />
      );
    }

    return card;
  };

  return (
    <div
      className={`app-shell${railCollapsed ? " rail-collapsed" : ""}${workspaceMode === "map" ? " mode-map" : " mode-focus"}${companionExpanded ? " companion-open" : ""}`}
    >
      <LeftRail
        collapsed={railCollapsed}
        onToggleCollapse={toggleRail}
      />
      <div className="workspace-main">{renderFocusMain()}</div>
      {/* Settings — bottom-left (not over companion) */}
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
      {/* Right-edge hover triangle → open shared companion (list/preview) */}
      {!companionMounted && workspaceMode === "focus" ? (
        <div className="edge-affordance" aria-hidden={false}>
          <button
            type="button"
            className="edge-affordance__tri"
            aria-label="打开资料与预览"
            title="打开资料"
            onClick={() => openMaterialsRail()}
          >
            <span className="edge-affordance__chev" aria-hidden />
          </button>
        </div>
      ) : null}
      <CommandPalette open={paletteOpen} onClose={closePalette} />
      <OpenDocPopover open={openDocOpen} onClose={closeOpenDoc} />
      <SettingsPanel
        open={settingsOpen}
        onClose={closeSettings}
        section={settingsSection}
        onSectionChange={setSettingsSection}
      />
    </div>
  );
}
