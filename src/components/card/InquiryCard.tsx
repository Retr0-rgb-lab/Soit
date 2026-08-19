import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appendResidue, precipitateConcept } from "../../lib/host";
import { termExplanation } from "../../lib/marks";
import { ancestorChain } from "../../lib/treeNav";
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
  const [float, setFloat] = useState<
    (TermFloatState & { turnId?: string; markId?: string }) | null
  >(null);
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
  const prevFocusRef = useRef(focusId);

  // Clear ephemeral UI + one-shot enter motion when focus card changes
  useEffect(() => {
    setDraft("");
    setQuote("");
    setFloat(null);
    setSelBar(null);
    setChooser(null);
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

    const span = highlightSpan;
    // Expand collapsed target turn if needed
    const turn = (turnsByCardId[focusId] ?? []).find((t) => t.id === span.turnId);
    if (turn?.collapsed) {
      toggleTurnCollapsed(turn.id);
    }

    const timer = window.setTimeout(() => {
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

      window.setTimeout(() => {
        target.classList.remove("mark-highlight");
        clearHighlight();
      }, HIGHLIGHT_MS);
    }, 40);

    return () => window.clearTimeout(timer);
  }, [highlightSpan, focusId, turnsByCardId, toggleTurnCollapsed, clearHighlight]);

  const sourceLabel = focus?.title || "概念";

  const runSpawn = useCallback(
    (
      kind: "deepen" | "diverge",
      label: string,
      extra?: { turnId?: string; markId?: string },
    ) => {
      setNavKind(kind);
      const text = (label || sourceLabel).slice(0, 48);
      const turns = focusId ? (turnsByCardId[focusId] ?? []) : [];
      const turnId =
        extra?.turnId || turns[turns.length - 1]?.id || "";
      const source: SourceSpan = {
        turnId,
        text,
        markId: extra?.markId,
      };
      void spawnInquiry({ kind, source, actor: "user" });
      setFloat(null);
      setSelBar(null);
      setChooser(null);
    },
    [spawnInquiry, sourceLabel, focusId, turnsByCardId],
  );

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

  const onMarkClick = useCallback(
    (
      term: string,
      x: number,
      y: number,
      meta: { turnId: string; markId?: string },
    ) => {
      setSelBar(null);
      setChooser(null);
      setFloat({
        term,
        body: termExplanation(term),
        x: x + 12,
        y: y + 12,
        turnId: meta.turnId,
        markId: meta.markId,
      });
    },
    [],
  );

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
      setFloat(null);
      setSelBar(null);
      setChooser(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

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

  const highlightTurnId = highlightSpan?.turnId;

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
                <div className="ic-msgs">
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
                        onToggleCollapsed={() => toggleTurnCollapsed(t.id)}
                        onDeepen={(label, turnId) =>
                          onDeepen(label, { turnId })
                        }
                        onDiverge={(label, turnId) =>
                          onDiverge(label, { turnId })
                        }
                        onRegenerate={() => regenerateTurn(t.id)}
                        onDelete={() => deleteTurn(t.id)}
                        onMarkClick={onMarkClick}
                        onAiMouseUp={onAiMouseUp}
                      />
                    ))
                  )}
                </div>
              </div>
            </article>
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

      {float ? (
        <TermFloat
          float={float}
          onClose={() => setFloat(null)}
          onDeepen={(term) =>
            onDeepen(term, { turnId: float.turnId, markId: float.markId })
          }
          onDiverge={(term) =>
            onDiverge(term, { turnId: float.turnId, markId: float.markId })
          }
        />
      ) : null}

      {selBar ? (
        <SelectionBar
          bar={selBar}
          onPreview={() => {
            setChooser({
              x: selBar.x,
              y: selBar.y,
              label: selBar.text.slice(0, 48),
              turnId: selBar.turnId,
            });
            setSelBar(null);
          }}
          onQuote={() => {
            setQuote(selBar.text);
            setSelBar(null);
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
