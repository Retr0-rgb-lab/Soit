import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FocusNavKind } from "../../lib/focusMotion";
import { scrollChromeFade } from "../../lib/scrollChromeFade";
import { ancestorChain, collectSubtreeIds } from "../../lib/treeNav";
import { getExplainCached } from "../../lib/explainCache";
import { explainSpan } from "../../state/explainActions";
import { useWorkspace } from "../../state/workspaceStore";
import type { SourceSpan } from "../../types";
import DirectionChooser from "../overlays/DirectionChooser";
import SelectionBar, {
  type SelectionBarState,
} from "../overlays/SelectionBar";
import TermFloat, { type TermFloatState } from "../overlays/TermFloat";
import TooltipLayer from "../overlays/TooltipLayer";
import "../overlays/overlays.css";
import CardHeader from "./CardHeader";
import Composer from "./Composer";
import EdgeActions from "./EdgeActions";
import CardPipWindow from "./CardPipWindow";
import HoverIconTray from "./HoverIconTray";
import {
  IconDeepen,
  IconFocus,
  IconFocusExit,
  IconJump,
  IconMap,
  IconRename,
  IconTrash,
} from "./icons";
import TurnHistoryRail from "./TurnHistoryRail";
import TurnItem from "./TurnItem";
import { useCardPip } from "./useCardPip";
import "./card.css";

function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text);
  }
}

const HIGHLIGHT_MS = 1200;

export default function InquiryCard() {
  const nodes = useWorkspace((s) => s.nodes);
  const focusId = useWorkspace((s) => s.focusId);
  const turnsByCardId = useWorkspace((s) => s.turnsByCardId);
  const edges = useWorkspace((s) => s.edges);
  const highlightSpan = useWorkspace((s) => s.highlightSpan);
  const focusNode = useWorkspace((s) => s.focusNode);
  const setMode = useWorkspace((s) => s.setWorkspaceMode);
  const spawnInquiry = useWorkspace((s) => s.spawnInquiry);
  const returnToSource = useWorkspace((s) => s.returnToSource);
  const clearHighlight = useWorkspace((s) => s.clearHighlight);
  const regenerateTurn = useWorkspace((s) => s.regenerateTurn);
  const deleteTurn = useWorkspace((s) => s.deleteTurn);
  const deleteInquiry = useWorkspace((s) => s.deleteInquiry);
  const renameCard = useWorkspace((s) => s.renameCard);
  const toggleTurnCollapsed = useWorkspace((s) => s.toggleTurnCollapsed);
  const setTurnStarred = useWorkspace((s) => s.setTurnStarred);
  const appendUserMessage = useWorkspace((s) => s.appendUserMessage);

  const focus = useMemo(
    () => nodes.find((n) => n.id === focusId),
    [nodes, focusId],
  );
  const turns = focusId ? (turnsByCardId[focusId] ?? []) : [];
  const crumbs = useMemo(
    () =>
      ancestorChain(nodes, focusId).map((n) => ({ id: n.id, title: n.title })),
    [nodes, focusId],
  );
  const parent = useMemo(() => {
    if (!focus?.parentId) return null;
    return nodes.find((n) => n.id === focus.parentId) ?? null;
  }, [focus, nodes]);

  const deleteChildCount = useMemo(() => {
    if (!focusId) return 0;
    const n = collectSubtreeIds(nodes, focusId).size;
    return Math.max(0, n - 1);
  }, [nodes, focusId]);

  /** Under-sheets: nearest ancestors (excluding focus). */
  const sheetAncestors = useMemo(() => {
    const chain = ancestorChain(nodes, focusId);
    // chain is root → focus; drop focus
    return chain.slice(0, -1);
  }, [nodes, focusId]);
  const sheetNear = sheetAncestors[sheetAncestors.length - 1] ?? null;
  const sheetFar =
    sheetAncestors.length >= 2
      ? sheetAncestors[sheetAncestors.length - 2]!
      : null;

  const inbound = useMemo(
    () => edges.find((e) => e.toCardId === focusId) ?? null,
    [edges, focusId],
  );

  const [draft, setDraft] = useState("");
  const [quote, setQuote] = useState("");
  const [enterOn, setEnterOn] = useState(false);
  const [settleOn, setSettleOn] = useState(false);
  const [navKind, setNavKind] = useState<"jump" | "deepen" | "diverge" | "back">(
    "jump",
  );
  const [float, setFloat] = useState<TermFloatState | null>(null);
  /** Bump on open/close/retry so late explainSpan results are ignored. */
  const floatSeqRef = useRef(0);
  const [selBar, setSelBar] = useState<
    (SelectionBarState & { turnId?: string }) | null
  >(null);
  const [chooser, setChooser] = useState<{
    x: number;
    y: number;
    label: string;
    turnId?: string;
    markId?: string;
  } | null>(null);
  const [spawnError, setSpawnError] = useState<string | null>(null);
  /** PEL-148: which turn the history rail treats as current / jumped-to */
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  /** External right-edge history dock open (hover hit strip / panel). */
  const [historyOpen, setHistoryOpen] = useState(false);
  /** 专注模式 — card + composer only */
  const [focusMode, setFocusMode] = useState(false);
  /** Confirm delete inquiry (+ subtree). */
  const [deleteAsk, setDeleteAsk] = useState(false);
  /** Inline title rename mode. */
  const [renaming, setRenaming] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  /** Explore-like: title chrome fades as body scrolls down (0..1). */
  const [chromeFade, setChromeFade] = useState(0);
  const prevFocusRef = useRef(focusId);
  const msgsRef = useRef<HTMLDivElement | null>(null);
  const cardWrapRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);

  /** Overlay header height → body padding so content can scroll into the top band. */
  const syncHeadPad = useCallback(() => {
    const head = headRef.current;
    const card = cardWrapRef.current?.querySelector(
      ".inquiry-card",
    ) as HTMLElement | null;
    if (!head || !card) return;
    const fadeRow = head.querySelector(".ic-head-fade") as HTMLElement | null;
    const contentH = fadeRow?.offsetHeight ?? head.offsetHeight;
    const styles = getComputedStyle(head);
    const padY =
      (parseFloat(styles.paddingTop) || 0) +
      (parseFloat(styles.paddingBottom) || 0);
    const h = Math.ceil(contentH + padY);
    card.style.setProperty("--ic-head-pad", `${Math.max(72, h)}px`);
  }, []);

  const onMsgsScroll = useCallback(() => {
    const el = msgsRef.current;
    if (!el) return;
    setChromeFade(scrollChromeFade(el.scrollTop));
  }, []);

  useEffect(() => {
    syncHeadPad();
    const head = headRef.current;
    if (!head || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => syncHeadPad());
    ro.observe(head);
    return () => ro.disconnect();
  }, [
    syncHeadPad,
    focusId,
    focus?.title,
    focus?.question,
    focus?.status,
    focusMode,
  ]);

  const onFocusCard = useCallback(
    (targetId: string, kind: FocusNavKind) => {
      setNavKind(
        kind === "deepen" || kind === "diverge" || kind === "back"
          ? kind
          : "jump",
      );
      focusNode(targetId);
      setMode("focus");
    },
    [focusNode, setMode],
  );

  const {
    mode: pipMode,
    peel,
    session: pipSession,
    pipMeta,
    onDragSurfacePointerDown,
    onDragSurfacePointerMove,
    onDragSurfacePointerUp,
    onDragSurfacePointerCancel,
    onPipDragTo,
    onPipEntered,
    onExpand,
    onClose,
    onExitDone,
  } = useCardPip({
    focusId,
    nodes,
    turnsByCardId,
    cardWrapRef,
    onFocusCard,
  });

  const confirmDeleteInquiry = useCallback(async () => {
    if (!focusId || deleteBusy) return;
    setDeleteBusy(true);
    try {
      if (pipSession?.cardId) {
        const doomed = collectSubtreeIds(nodes, focusId);
        if (doomed.has(pipSession.cardId)) onClose();
      }
      await deleteInquiry(focusId);
      setDeleteAsk(false);
    } finally {
      setDeleteBusy(false);
    }
  }, [focusId, deleteBusy, pipSession, nodes, onClose, deleteInquiry]);

  // Clear ephemeral UI + one-shot enter motion when focus card changes
  // (PiP session is independent — entering PiP intentionally switches stage focus)
  useEffect(() => {
    setDraft("");
    setQuote("");
    floatSeqRef.current += 1;
    setFloat(null);
    setSelBar(null);
    setChooser(null);
    setSpawnError(null);
    setDeleteAsk(false);
    setDeleteBusy(false);
    setRenaming(false);
    setActiveTurnId(null);
    setHistoryOpen(false);
    setChromeFade(0);
    if (msgsRef.current) msgsRef.current.scrollTop = 0;
    if (!focusId) return;

    const prev = prevFocusRef.current;
    if (prev && prev !== focusId && navKind === "jump") {
      const prevNode = nodes.find((n) => n.id === prev);
      if (prevNode?.parentId === focusId) {
        setNavKind("back");
      }
    }
    prevFocusRef.current = focusId;
    setEnterOn(true);
    setSettleOn(true);
    const t = window.setTimeout(() => setSettleOn(false), 420);
    return () => window.clearTimeout(t);
    // navKind intentionally read once per focus change; set via handlers before spawn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  // PEL-161: same card — after user sends / AI updates last turn, pin to bottom.
  // Do not fight the focus-change reset (scrollTop = 0) above.
  const lastTurn = turns.length ? turns[turns.length - 1]! : null;
  const lastTurnKey = lastTurn
    ? `${lastTurn.id}:${lastTurn.user.length}:${lastTurn.aiHtml.length}:${lastTurn.think.length}`
    : "";
  const scrollFocusRef = useRef(focusId);
  const lastScrollKeyRef = useRef("");
  useEffect(() => {
    if (scrollFocusRef.current !== focusId) {
      scrollFocusRef.current = focusId;
      lastScrollKeyRef.current = lastTurnKey;
      return;
    }
    if (!focusId || !lastTurn || !lastTurnKey) return;
    if (lastScrollKeyRef.current === lastTurnKey) return;
    lastScrollKeyRef.current = lastTurnKey;
    const root = msgsRef.current;
    if (!root) return;
    const el = root.querySelector(
      `.ic-turn[data-turn="${CSS.escape(lastTurn.id)}"]`,
    ) as HTMLElement | null;
    const go = () => {
      if (el) {
        el.scrollIntoView({ block: "end", behavior: "smooth" });
      } else {
        root.scrollTop = root.scrollHeight;
      }
    };
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(go);
    });
    return () => window.cancelAnimationFrame(id);
  }, [focusId, lastTurnKey, lastTurn]);

  useEffect(() => {
    document.body.classList.toggle("has-selbar", Boolean(selBar));
    return () => document.body.classList.remove("has-selbar");
  }, [selBar]);

  // Return-to-source: expand turn, scroll mark into view, flash highlight
  useEffect(() => {
    if (!highlightSpan || !focusId) return;

    let cancelled = false;
    const span = highlightSpan;
    // Expand collapsed target turn if needed
    const turn = (turnsByCardId[focusId] ?? []).find((t) => t.id === span.turnId);
    if (turn?.collapsed) {
      toggleTurnCollapsed(turn.id, focusId);
    }

    let innerTimer = 0;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const root =
        document.querySelector(`[data-turn="${CSS.escape(span.turnId)}"]`) ??
        document.querySelector(`[data-turn-id="${CSS.escape(span.turnId)}"]`);
      if (!root) {
        clearHighlight();
        return;
      }

      let mark: Element | null = null;
      if (span.markId) {
        mark =
          root.querySelector(`.mark[data-mark-id="${CSS.escape(span.markId)}"]`) ??
          root.querySelector(`.mark[data-term="${CSS.escape(span.markId)}"]`);
      }
      if (!mark && span.text) {
        const marks = root.querySelectorAll(".mark");
        for (const m of marks) {
          const term = m.getAttribute("data-term") || m.textContent || "";
          if (term === span.text || (m.textContent || "").includes(span.text)) {
            mark = m;
            break;
          }
        }
      }
      // Fallback: highlight the whole AI block if no mark match
      const target = mark ?? root.querySelector(".ai-html") ?? root;
      target.classList.add("mark-highlight");
      target.scrollIntoView({ block: "center", behavior: "smooth" });

      innerTimer = window.setTimeout(() => {
        if (cancelled) return;
        target.classList.remove("mark-highlight");
        clearHighlight();
      }, HIGHLIGHT_MS);
    }, 40);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (innerTimer) window.clearTimeout(innerTimer);
    };
  }, [highlightSpan, focusId, turnsByCardId, toggleTurnCollapsed, clearHighlight]);

  // Escape dismisses card overlays (chooser → selection → term float)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (chooser) {
        e.preventDefault();
        e.stopPropagation();
        setChooser(null);
        return;
      }
      if (selBar) {
        e.preventDefault();
        e.stopPropagation();
        setSelBar(null);
        return;
      }
      if (float) {
        e.preventDefault();
        e.stopPropagation();
        floatSeqRef.current += 1;
        setFloat(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [chooser, selBar, float]);

  useEffect(() => {
    return useWorkspace.subscribe((s, prev) => {
      if (s.workspaceMode === "map" && prev.workspaceMode !== "map") {
        setFocusMode(false);
      }
    });
  }, []);

  useEffect(() => {
    document.body.classList.toggle("soit-focus-mode", focusMode);
    return () => document.body.classList.remove("soit-focus-mode");
  }, [focusMode]);

  // Enter animation: clear enterOn even when prefers-reduced-motion skips animationend
  useEffect(() => {
    if (!enterOn) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const ms = reduced ? 50 : 520;
    const t = window.setTimeout(() => {
      setEnterOn(false);
      setNavKind("jump");
    }, ms);
    return () => window.clearTimeout(t);
  }, [enterOn, focusId]);

  // DocPane quote → same composer chip as card selection (PEL-156 D5).
  useEffect(() => {
    const onQuote = (e: Event) => {
      const detail = (e as CustomEvent<{ quote?: string }>).detail;
      const q = detail?.quote?.trim();
      if (!q) return;
      setQuote(q);
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLTextAreaElement>(
          ".ic-dock textarea",
        );
        el?.focus();
      });
    };
    window.addEventListener("soit:set-composer-quote", onQuote);
    return () => window.removeEventListener("soit:set-composer-quote", onQuote);
  }, []);

  const sourceLabel = focus?.title || "概念";

  const runSpawn = useCallback(
    (
      kind: "deepen" | "diverge",
      label: string,
      extra?: { turnId?: string; markId?: string },
    ) => {
      setNavKind(kind);
      setSpawnError(null);
      // Full span for SourceSpan.text (explain/selection); title truncation is spawnMerge's job.
      const text = (label || sourceLabel).trim() || sourceLabel;
      const turns = focusId ? (turnsByCardId[focusId] ?? []) : [];
      const turnId =
        extra?.turnId || turns[turns.length - 1]?.id || "";
      const source: SourceSpan = {
        turnId,
        text,
        markId: extra?.markId,
      };
      void spawnInquiry({ kind, source, actor: "user" }).then((id) => {
        if (!id) {
          setNavKind("jump");
          setSpawnError(
            kind === "deepen" ? "深挖失败，请重试" : "发散失败，请重试",
          );
        }
      });
      floatSeqRef.current += 1;
      setFloat(null);
      setSelBar(null);
      setChooser(null);
    },
    [spawnInquiry, sourceLabel, focusId, turnsByCardId],
  );

  const focusComposer = useCallback(() => {
    const el = document.querySelector<HTMLTextAreaElement>(".ic-dock textarea");
    el?.focus();
  }, []);

  const displayTerm = useCallback((span: string) => {
    const t = span.trim();
    if (t.length <= 24) return t;
    return `${t.slice(0, 24)}…`;
  }, []);

  const onDeepen = useCallback(
    (label?: string, extra?: { turnId?: string; markId?: string }) => {
      runSpawn("deepen", label || sourceLabel, extra);
    },
    [runSpawn, sourceLabel],
  );

  const onDiverge = useCallback(
    (label?: string, extra?: { turnId?: string; markId?: string }) => {
      runSpawn("diverge", label || sourceLabel, extra);
    },
    [runSpawn, sourceLabel],
  );

  const onSend = useCallback(
    (body: string) => {
      const text = body.trim();
      if (!text || !focusId) return;
      // Quote / card refs / attachments already folded into body by Composer.
      appendUserMessage(text);
      setDraft("");
      setQuote("");
    },
    [appendUserMessage, focusId],
  );

  const runExplain = useCallback(
    async (
      span: string,
      cardId: string,
      seq: number,
      opts?: { skipCache?: boolean },
    ) => {
      try {
        const text = await explainSpan({
          cardId,
          span,
          skipCache: opts?.skipCache,
        });
        if (floatSeqRef.current !== seq) return;
        setFloat((prev) =>
          prev
            ? {
                ...prev,
                body: text,
                status: "ready",
                error: undefined,
              }
            : null,
        );
      } catch (err) {
        if (floatSeqRef.current !== seq) return;
        const message =
          err instanceof Error && err.message
            ? err.message
            : "解释失败，请重试";
        setFloat((prev) =>
          prev
            ? {
                ...prev,
                body: "",
                status: "error",
                error: message,
              }
            : null,
        );
      }
    },
    [],
  );

  const onFloatMove = useCallback((x: number, y: number) => {
    setFloat((prev) => (prev ? { ...prev, x, y } : null));
  }, []);

  const onMarkClick = useCallback(
    (
      term: string,
      x: number,
      y: number,
      meta: { turnId: string; markId?: string },
    ) => {
      if (!focusId) return;
      setSelBar(null);
      setChooser(null);
      const span = term;
      const seq = ++floatSeqRef.current;
      const cached = getExplainCached(focusId, span);
      setFloat({
        term,
        span,
        body: cached ?? "",
        status: cached ? "ready" : "loading",
        x: x + 12,
        y: y + 12,
        source: "mark",
        turnId: meta.turnId,
        markId: meta.markId,
      });
      if (!cached) void runExplain(span, focusId, seq);
    },
    [focusId, runExplain],
  );

  const onFloatRetry = useCallback(() => {
    if (!float || !focusId) return;
    const seq = ++floatSeqRef.current;
    setFloat((prev) =>
      prev
        ? {
            ...prev,
            body: "",
            status: "loading",
            error: undefined,
          }
        : null,
    );
    void runExplain(float.span, focusId, seq, { skipCache: true });
  }, [float, focusId, runExplain]);

  const closeFloat = useCallback(() => {
    floatSeqRef.current += 1;
    setFloat(null);
  }, []);

  const onSelectionExplain = useCallback(() => {
    if (!selBar || !focusId) return;
    const span = selBar.text;
    const x = selBar.x;
    const y = selBar.y;
    const turnId = selBar.turnId;
    setSelBar(null);
    setChooser(null);
    const seq = ++floatSeqRef.current;
    const cached = getExplainCached(focusId, span);
    setFloat({
      term: displayTerm(span),
      span,
      body: cached ?? "",
      status: cached ? "ready" : "loading",
      x: x + 12,
      y: y + 12,
      source: "selection",
      turnId,
    });
    if (!cached) void runExplain(span, focusId, seq);
  }, [selBar, focusId, displayTerm, runExplain]);

  const onFloatQuote = useCallback(() => {
    if (!float) return;
    setQuote(float.span);
    floatSeqRef.current += 1;
    setFloat(null);
    focusComposer();
  }, [float, focusComposer]);

  const onAiMouseUp = useCallback((e: React.MouseEvent, turnId: string) => {
    const t = e.target;
    if (t instanceof Element && t.closest(".mark")) return;

    const sel = window.getSelection();
    const text = sel ? String(sel.toString() || "").trim() : "";
    if (!text || text.length < 2) {
      setSelBar(null);
      return;
    }
    const anchor = sel?.anchorNode;
    const el =
      anchor instanceof Element
        ? anchor
        : anchor?.parentElement ?? null;
    if (!el?.closest(".ai-html")) {
      setSelBar(null);
      return;
    }
    const range = sel!.rangeCount ? sel!.getRangeAt(0) : null;
    const rect = range?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : e.clientX;
    const y = rect ? rect.top - 8 : e.clientY;
    floatSeqRef.current += 1;
    setFloat(null);
    setChooser(null);
    setSelBar({ text, x, y: Math.max(8, y - 40), turnId });
  }, []);

  // PEL-163: short-explain float stays until explicit close — do not dismiss on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (
        t.closest(".ic-float") ||
        t.closest(".ic-selbar") ||
        t.closest(".ic-chooser") ||
        t.closest(".mark")
      ) {
        return;
      }
      if (t.closest(".ai-html")) return;
      setSelBar(null);
      setChooser(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const highlightTurnId = highlightSpan?.turnId;

  // Prefer explicit rail selection; else first expanded turn; else last turn.
  const railActiveId = useMemo(() => {
    if (activeTurnId && turns.some((t) => t.id === activeTurnId)) {
      return activeTurnId;
    }
    if (highlightTurnId && turns.some((t) => t.id === highlightTurnId)) {
      return highlightTurnId;
    }
    const open = turns.find((t) => !t.collapsed);
    if (open) return open.id;
    return turns.length ? turns[turns.length - 1]!.id : null;
  }, [activeTurnId, highlightTurnId, turns]);

  const scrollToTurn = useCallback((turnId: string) => {
    const root = msgsRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-turn="${CSS.escape(turnId)}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, []);

  const onSelectHistoryTurn = useCallback(
    (turnId: string) => {
      if (!focusId) return;
      setActiveTurnId(turnId);
      setHistoryOpen(true);
      const turn = turns.find((t) => t.id === turnId);
      if (turn?.collapsed) {
        toggleTurnCollapsed(turnId, focusId);
      }
      // Wait a frame so expand layout settles before scroll.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToTurn(turnId));
      });
    },
    [focusId, turns, toggleTurnCollapsed, scrollToTurn],
  );

  if (!focus) {
    return (
      <div className="inquiry-root">
        <div className="inquiry-stage">
          <p className="inquiry-empty">加载探究卡…</p>
        </div>
        <TooltipLayer />
      </div>
    );
  }

  const peelDx = peel?.dx ?? 0;
  const peelDy = peel?.dy ?? 0;
  const peelStyle =
    peel?.peeling && pipMode === "dragging"
      ? {
          transform: `translate3d(${peelDx * 0.92}px, ${peelDy * 0.92}px, 0) rotate(${peelDx * 0.03}deg)`,
        }
      : undefined;

  return (
    <div className={`inquiry-root${focusMode ? " is-focus-mode" : ""}`}>
      <div className="inquiry-stage">
        <div
          className={`inquiry-stack${settleOn ? " settle" : ""}${enterOn ? " switching" : ""}${peel?.peeling ? " peeling" : ""}`}
        >
          {sheetFar ? (
            <button
              type="button"
              className="inquiry-sheet s2"
              onClick={() => {
                setNavKind("back");
                focusNode(sheetFar.id);
                setMode("focus");
              }}
              aria-label={`返回 ${sheetFar.title}`}
            >
              <span className="inquiry-sheet-label">{sheetFar.title}</span>
            </button>
          ) : (
            <div className="inquiry-sheet s2" aria-hidden />
          )}

          {sheetNear ? (
            <button
              type="button"
              className="inquiry-sheet s1"
              onClick={() => {
                setNavKind("back");
                focusNode(sheetNear.id);
                setMode("focus");
              }}
              aria-label={`返回 ${sheetNear.title}`}
            >
              <span className="inquiry-sheet-label">{sheetNear.title}</span>
            </button>
          ) : (
            <div className="inquiry-sheet s1" aria-hidden />
          )}

          <div
            className="inquiry-card-wrap"
            ref={cardWrapRef}
            style={peelStyle}
          >
            <article
              className={`inquiry-card${enterOn ? ` enter enter-${navKind}` : ""}`}
              aria-label="inquiry card body"
              onAnimationEnd={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.animationName.startsWith("card-enter")) {
                  setEnterOn(false);
                  setNavKind("jump");
                }
              }}
            >
              <CardHeader
                ref={headRef}
                crumbs={crumbs}
                title={focus.title}
                status={focus.status ?? null}
                question={focus.question ?? null}
                parent={parent}
                onCrumb={(id) => {
                  setNavKind("back");
                  focusNode(id);
                  setMode("focus");
                }}
                onReturnToSource={() => {
                  setNavKind("back");
                  returnToSource(inbound?.source ?? null);
                }}
                onDragSurfacePointerDown={onDragSurfacePointerDown}
                onDragSurfacePointerMove={onDragSurfacePointerMove}
                onDragSurfacePointerUp={onDragSurfacePointerUp}
                onDragSurfacePointerCancel={onDragSurfacePointerCancel}
                chromeFade={chromeFade}
                renaming={renaming}
                onRename={(t) => void renameCard(focusId, t)}
                onRenamingChange={setRenaming}
              />
              <div className="ic-body">
                <div
                  className="ic-msgs"
                  ref={msgsRef}
                  onScroll={onMsgsScroll}
                >
                  {turns.length === 0 ? (
                    <p className="inquiry-empty" style={{ padding: "12px 0" }}>
                      {focus.kind === "diverge"
                        ? "发散卡：空白对话。从输入框开始，或点「来自」回源。"
                        : "本卡尚无轮次。"}
                    </p>
                  ) : (
                    turns.map((t) => (
                      <TurnItem
                        key={t.id}
                        turn={t}
                        forceExpand={highlightTurnId === t.id}
                        railTarget={railActiveId === t.id}
                        onToggleCollapsed={() =>
                          toggleTurnCollapsed(t.id, focusId)
                        }
                        onDeepen={(label, turnId) =>
                          onDeepen(label, { turnId })
                        }
                        onDiverge={(label, turnId) =>
                          onDiverge(label, { turnId })
                        }
                        onRegenerate={() => regenerateTurn(t.id, focusId)}
                        onDelete={() => deleteTurn(t.id, focusId)}
                        onToggleStar={() =>
                          void setTurnStarred(t.id, !t.starred, focusId)
                        }
                        onMarkClick={onMarkClick}
                        onAiMouseUp={onAiMouseUp}
                      />
                    ))
                  )}
                </div>
              </div>
              {/* Bottom-left tools: hidden until card hover (same layer as card) */}
              <div className="ic-card-tools-bl">
                <HoverIconTray label="卡片工具">
                  <button
                    type="button"
                    className="ic-round"
                    data-tip="跳转卡片 Ctrl+K"
                    aria-label="跳转卡片"
                    onClick={() =>
                      window.dispatchEvent(new CustomEvent("soit:open-palette"))
                    }
                  >
                    <IconJump />
                  </button>
                  <button
                    type="button"
                    className="ic-round"
                    data-tip="图谱 Ctrl+\\"
                    aria-label="打开图谱"
                    onClick={() => setMode("map")}
                  >
                    <IconMap />
                  </button>
                  <button
                    type="button"
                    className={`ic-round${focusMode ? " on" : ""}`}
                    data-tip={focusMode ? "退出专注 Esc" : "专注模式"}
                    aria-label={focusMode ? "退出专注模式" : "专注模式"}
                    aria-pressed={focusMode}
                    onClick={() => setFocusMode((v) => !v)}
                  >
                    {focusMode ? <IconFocusExit /> : <IconFocus />}
                  </button>
                  <button
                    type="button"
                    className="ic-round"
                    data-tip="从此卡片深挖"
                    aria-label="从此卡片深挖"
                    onClick={() => onDeepen(focus.title)}
                  >
                    <IconDeepen />
                  </button>
                  <button
                    type="button"
                    className="ic-round"
                    data-tip="重命名"
                    aria-label="重命名探究"
                    onClick={() => setRenaming(true)}
                  >
                    <IconRename />
                  </button>
                  <button
                    type="button"
                    className="ic-round danger"
                    data-tip="删除探究"
                    aria-label="删除探究"
                    onClick={() => setDeleteAsk(true)}
                  >
                    <IconTrash />
                  </button>
                </HoverIconTray>
              </div>
            </article>
            {/* In-flow right rail — open state shrinks the card */}
            <TurnHistoryRail
              turns={turns}
              activeTurnId={railActiveId}
              onSelect={onSelectHistoryTurn}
              open={historyOpen}
              onOpenChange={setHistoryOpen}
            />
          </div>
        </div>
      </div>

      <EdgeActions
        onDeepen={() => onDeepen(focus.title)}
        onDiverge={() => onDiverge(focus.title)}
      />

      <Composer
        draft={draft}
        quote={quote}
        onDraftChange={setDraft}
        onClearQuote={() => setQuote("")}
        onSend={onSend}
      />
      {spawnError ? (
        <p className="ic-spawn-error" role="alert">
          {spawnError}
        </p>
      ) : null}

      {deleteAsk && focus
        ? createPortal(
            <div
              className="ic-delete-mask"
              role="presentation"
              onClick={() => {
                if (!deleteBusy) setDeleteAsk(false);
              }}
            >
              <div
                className="ic-delete-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="ic-del-title"
                aria-describedby="ic-del-body"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="ic-del-title" className="ic-delete-title">
                  {deleteChildCount > 0
                    ? "删除探究及子树？"
                    : "删除这张探究？"}
                </h2>
                <p id="ic-del-body" className="ic-delete-body">
                  {deleteChildCount > 0
                    ? `将删除「${focus.title}」及其下 ${deleteChildCount} 张子探究（含对话与边），且无法撤销。不会改动 Obsidian 笔记。`
                    : `「${focus.title}」的对话与关联边将永久移除，且无法撤销。不会改动 Obsidian 笔记。`}
                  {nodes.length <= deleteChildCount + 1
                    ? " 删除后本宇宙将没有探究卡片。"
                    : ""}
                </p>
                <div className="ic-delete-actions">
                  <button
                    type="button"
                    className="ic-delete-btn ghost"
                    disabled={deleteBusy}
                    onClick={() => setDeleteAsk(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="ic-delete-btn danger"
                    disabled={deleteBusy}
                    onClick={() => void confirmDeleteInquiry()}
                  >
                    {deleteBusy
                      ? "删除中…"
                      : deleteChildCount > 0
                        ? "删除子树"
                        : "删除"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {float ? (
        <TermFloat
          float={float}
          onClose={closeFloat}
          onRetry={onFloatRetry}
          onDeepen={() =>
            onDeepen(float.span, {
              turnId: float.turnId,
              markId: float.markId,
            })
          }
          onDiverge={() =>
            onDiverge(float.span, {
              turnId: float.turnId,
              markId: float.markId,
            })
          }
          onQuote={onFloatQuote}
          onMove={onFloatMove}
        />
      ) : null}

      {selBar ? (
        <SelectionBar
          bar={selBar}
          onExplain={onSelectionExplain}
          onPreview={() => {
            // Keep selection bar visible; open paper-styled direction chooser beside it.
            setChooser({
              x: selBar.x + 52,
              y: selBar.y,
              // Full selection for SourceSpan; card title still short in spawnMerge.
              label: selBar.text,
              turnId: selBar.turnId,
            });
          }}
          onQuote={() => {
            setQuote(selBar.text);
            setSelBar(null);
            focusComposer();
          }}
          onCopy={() => {
            copyText(selBar.text);
            setSelBar(null);
          }}
        />
      ) : null}

      {pipSession && pipMeta ? (
        <CardPipWindow
          session={pipSession}
          title={pipMeta.title}
          snippet={pipMeta.snippet}
          kindLabel={pipMeta.kindLabel}
          onExpand={onExpand}
          onClose={onClose}
          onDragTo={onPipDragTo}
          onEntered={onPipEntered}
          onExitDone={onExitDone}
        />
      ) : null}

      {chooser ? (
        <DirectionChooser
          x={chooser.x}
          y={chooser.y}
          sourceLabel={chooser.label}
          sourceSpan={
            chooser.turnId
              ? { turnId: chooser.turnId, markId: chooser.markId }
              : undefined
          }
          onDeepen={(label, span) => {
            setSelBar(null);
            setChooser(null);
            onDeepen(label, {
              turnId: span?.turnId ?? chooser.turnId,
              markId: span?.markId ?? chooser.markId,
            });
          }}
          onDiverge={(label, span) => {
            setSelBar(null);
            setChooser(null);
            onDiverge(label, {
              turnId: span?.turnId ?? chooser.turnId,
              markId: span?.markId ?? chooser.markId,
            });
          }}
        />
      ) : null}

      <TooltipLayer />
    </div>
  );
}
