import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appendResidue, precipitateConcept } from "../../lib/host";
import { ancestorChain } from "../../lib/treeNav";
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
import CardAgentMenu from "./CardAgentMenu";
import CardHeader from "./CardHeader";
import Composer from "./Composer";
import EdgeActions from "./EdgeActions";
import TurnHistoryRail from "./TurnHistoryRail";
import TurnItem from "./TurnItem";
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
  const toggleTurnCollapsed = useWorkspace((s) => s.toggleTurnCollapsed);
  const appendUserMessage = useWorkspace((s) => s.appendUserMessage);
  const vaultPath = useWorkspace((s) => s.vaultPath);

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
  const prevFocusRef = useRef(focusId);
  const msgsRef = useRef<HTMLDivElement | null>(null);

  // Clear ephemeral UI + one-shot enter motion when focus card changes
  useEffect(() => {
    setDraft("");
    setQuote("");
    floatSeqRef.current += 1;
    setFloat(null);
    setSelBar(null);
    setChooser(null);
    setSpawnError(null);
    setActiveTurnId(null);
    setHistoryOpen(false);
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

  const onSend = useCallback(() => {
    const text = draft.trim();
    if (!text || !focusId) return;
    appendUserMessage(text, quote || undefined);
    setDraft("");
    setQuote("");
  }, [appendUserMessage, draft, focusId, quote]);

  const onPrecipitateConcept = useCallback(async () => {
    if (!focus) return;
    const r = await precipitateConcept({
      cardId: focus.id,
      title: focus.title,
      question: focus.question ?? null,
    });
    if (!r.ok) {
      window.alert(r.error || "写入概念失败");
      return;
    }
    if (r.bodySkipped) {
      window.alert(
        `已合并卡片 id 到概念页（保留你的正文）\n${r.path ?? ""}`,
      );
    } else {
      window.alert(`已写入概念\n${r.path ?? ""}`);
    }
  }, [focus]);

  const onAppendResidue = useCallback(async () => {
    if (!focus) return;
    const text = window.prompt("记下残渣（短笔记，会追加到 vault/inquiry/）");
    if (text == null) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const r = await appendResidue(focus.id, trimmed);
    if (!r.ok) {
      window.alert(r.error || "记下残渣失败");
      return;
    }
    window.alert(`已记下残渣\n${r.path ?? ""}`);
  }, [focus]);

  const runExplain = useCallback(
    async (span: string, cardId: string, seq: number) => {
      try {
        const text = await explainSpan({ cardId, span });
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
      setFloat({
        term,
        span,
        body: "",
        status: "loading",
        x: x + 12,
        y: y + 12,
        source: "mark",
        turnId: meta.turnId,
        markId: meta.markId,
      });
      void runExplain(span, focusId, seq);
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
    void runExplain(float.span, focusId, seq);
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
    setFloat({
      term: displayTerm(span),
      span,
      body: "",
      status: "loading",
      x: x + 12,
      y: y + 12,
      source: "selection",
      turnId,
    });
    void runExplain(span, focusId, seq);
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
      floatSeqRef.current += 1;
      setFloat(null);
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

  return (
    <div className="inquiry-root">
      <div className="inquiry-stage">
        <div
          className={`inquiry-stack${settleOn ? " settle" : ""}${enterOn ? " switching" : ""}`}
        >
          <div className="inquiry-sheet s2" />
          <div className="inquiry-sheet s1" />
          <div className="inquiry-card-wrap">
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
                crumbs={crumbs}
                title={focus.title}
                status={focus.status ?? null}
                question={focus.question ?? null}
                parent={parent}
                vaultBound={Boolean(vaultPath)}
                onPrecipitateConcept={onPrecipitateConcept}
                onAppendResidue={onAppendResidue}
                onDeepen={() => onDeepen(focus.title)}
                onCrumb={(id) => {
                  setNavKind("back");
                  focusNode(id);
                  setMode("focus");
                }}
                onReturnToSource={() => {
                  setNavKind("back");
                  returnToSource(inbound?.source ?? null);
                }}
                onOpenMap={() => setMode("map")}
                onOpenPalette={() =>
                  window.dispatchEvent(new CustomEvent("soit:open-palette"))
                }
              />
              <div className="ic-body">
                <div className="ic-msgs" ref={msgsRef}>
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
                        onMarkClick={onMarkClick}
                        onAiMouseUp={onAiMouseUp}
                      />
                    ))
                  )}
                </div>
              </div>
            </article>
            {/* Outside card — flush right edge; does not squeeze card width */}
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

      <CardAgentMenu />

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
        />
      ) : null}

      {selBar ? (
        <SelectionBar
          bar={selBar}
          onExplain={onSelectionExplain}
          onPreview={() => {
            setChooser({
              x: selBar.x,
              y: selBar.y,
              // Full selection for SourceSpan; card title still short in spawnMerge.
              label: selBar.text,
              turnId: selBar.turnId,
            });
            setSelBar(null);
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
          onDeepen={(label, span) =>
            onDeepen(label, {
              turnId: span?.turnId ?? chooser.turnId,
              markId: span?.markId ?? chooser.markId,
            })
          }
          onDiverge={(label, span) =>
            onDiverge(label, {
              turnId: span?.turnId ?? chooser.turnId,
              markId: span?.markId ?? chooser.markId,
            })
          }
        />
      ) : null}

      <TooltipLayer />
    </div>
  );
}
