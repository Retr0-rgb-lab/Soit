import { useCallback, useEffect, useMemo, useState } from "react";
import { termExplanation } from "../../lib/marks";
import { ancestorChain } from "../../lib/treeNav";
import { useWorkspace } from "../../state/workspaceStore";
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

export default function InquiryCard() {
  const nodes = useWorkspace((s) => s.nodes);
  const focusId = useWorkspace((s) => s.focusId);
  const turnsByCardId = useWorkspace((s) => s.turnsByCardId);
  const focusNode = useWorkspace((s) => s.focusNode);
  const setMode = useWorkspace((s) => s.setWorkspaceMode);
  const spawnDeepen = useWorkspace((s) => s.spawnDeepen);
  const spawnDiverge = useWorkspace((s) => s.spawnDiverge);
  const regenerateTurn = useWorkspace((s) => s.regenerateTurn);
  const deleteTurn = useWorkspace((s) => s.deleteTurn);
  const toggleTurnCollapsed = useWorkspace((s) => s.toggleTurnCollapsed);
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

  const [draft, setDraft] = useState("");
  const [quote, setQuote] = useState("");
  const [enterOn, setEnterOn] = useState(false);
  const [float, setFloat] = useState<TermFloatState | null>(null);
  const [selBar, setSelBar] = useState<SelectionBarState | null>(null);
  const [chooser, setChooser] = useState<{
    x: number;
    y: number;
    label: string;
  } | null>(null);

  // Clear ephemeral UI + one-shot enter motion when focus card changes
  useEffect(() => {
    setDraft("");
    setQuote("");
    setFloat(null);
    setSelBar(null);
    setChooser(null);
    if (focusId) setEnterOn(true);
  }, [focusId]);

  const sourceLabel = focus?.title || "概念";

  const onDeepen = useCallback(
    (label?: string) => {
      spawnDeepen((label || sourceLabel).slice(0, 48));
      setFloat(null);
      setSelBar(null);
      setChooser(null);
    },
    [spawnDeepen, sourceLabel],
  );

  const onDiverge = useCallback(
    (label?: string) => {
      spawnDiverge((label || sourceLabel).slice(0, 48));
      setFloat(null);
      setSelBar(null);
      setChooser(null);
    },
    [spawnDiverge, sourceLabel],
  );

  const onSend = useCallback(() => {
    const text = draft.trim();
    if (!text || !focusId) return;
    appendUserMessage(text, quote || undefined);
    setDraft("");
    setQuote("");
  }, [appendUserMessage, draft, focusId, quote]);

  const onMarkClick = useCallback((term: string, x: number, y: number) => {
    setSelBar(null);
    setChooser(null);
    setFloat({
      term,
      body: termExplanation(term),
      x: x + 12,
      y: y + 12,
    });
  }, []);

  const onAiMouseUp = useCallback((e: React.MouseEvent) => {
    // ignore clicks that open a mark float
    const t = e.target;
    if (t instanceof Element && t.closest(".mark")) return;

    const sel = window.getSelection();
    const text = sel ? String(sel.toString() || "").trim() : "";
    if (!text || text.length < 2) {
      setSelBar(null);
      return;
    }
    // only when selection is inside .ai-html
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
    setSelBar({ text, x, y: Math.max(8, y - 40) });
  }, []);

  // dismiss float/sel when clicking outside
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

  return (
    <div className="inquiry-root">
      <div className="inquiry-stage">
        <div className="inquiry-stack">
          <div className="inquiry-sheet s2" />
          <div className="inquiry-sheet s1" />
          <div className="inquiry-card-wrap">
            <article
              className={`inquiry-card${enterOn ? " enter" : ""}`}
              aria-label="inquiry card body"
              onAnimationEnd={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.animationName === "card-enter") setEnterOn(false);
              }}
            >
              <CardHeader
                crumbs={crumbs}
                title={focus.title}
                parent={parent}
                onDeepen={() => onDeepen(focus.title)}
                onCrumb={(id) => {
                  focusNode(id);
                  setMode("focus");
                }}
                onOpenMap={() => setMode("map")}
                onOpenPalette={() =>
                  window.dispatchEvent(new CustomEvent("soit:open-palette"))
                }
              />
              <div className="ic-body">
                <div className="ic-msgs">
                  {turns.map((t) => (
                    <TurnItem
                      key={t.id}
                      turn={t}
                      onToggleCollapsed={() => toggleTurnCollapsed(t.id)}
                      onDeepen={(label) => onDeepen(label)}
                      onDiverge={(label) => onDiverge(label)}
                      onRegenerate={() => regenerateTurn(t.id)}
                      onDelete={() => deleteTurn(t.id)}
                      onMarkClick={onMarkClick}
                      onAiMouseUp={onAiMouseUp}
                    />
                  ))}
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
          onDeepen={(term) => onDeepen(term)}
          onDiverge={(term) => onDiverge(term)}
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
          onDeepen={(label) => onDeepen(label)}
          onDiverge={(label) => onDiverge(label)}
        />
      ) : null}

      <TooltipLayer />
    </div>
  );
}
