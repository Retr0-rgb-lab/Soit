import { useCallback, useMemo, useState } from "react";
import { cardBriefToMarkdown } from "../../lib/cardBrief";
import { DEFAULT_RUNTIME_PREFS } from "../../lib/runtime";
import { useWorkspace } from "../../state/workspaceStore";

type Feedback = { kind: "ok" | "err"; text: string } | null;

async function copyWithFallback(text: string): Promise<"clipboard" | "fallback"> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return "clipboard";
    }
  } catch {
    /* WebView / permission — show fallback */
  }
  return "fallback";
}

/**
 * Card dual-track actions: export brief · paste import · local Agent handoff.
 * Spec v1.1 §2.4 / §2.7 — thin menu so InquiryCard stays under LOC budget.
 */
export default function CardAgentMenu() {
  const focusId = useWorkspace((s) => s.focusId);
  const inquiryInflight = useWorkspace((s) => s.inquiryInflight);
  const runtimeRun = useWorkspace((s) => s.runtimeRun);
  const runtimes = useWorkspace((s) => s.runtimes);
  const runtimePrefs = useWorkspace((s) => s.runtimePrefs);
  const exportCardBrief = useWorkspace((s) => s.exportCardBrief);
  const importAssistantToFocus = useWorkspace((s) => s.importAssistantToFocus);
  const startRuntimeHandoff = useWorkspace((s) => s.startRuntimeHandoff);

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [fallbackMd, setFallbackMd] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [handoffConfirm, setHandoffConfirm] = useState(false);

  const runtimeBusy =
    runtimeRun?.status === "staging" || runtimeRun?.status === "running";
  const locked = Boolean(inquiryInflight) || runtimeBusy || busy || !focusId;

  const prefs = runtimePrefs ?? DEFAULT_RUNTIME_PREFS;
  const runtimeId = (prefs.defaultRuntimeId || "mock").trim() || "mock";
  const runtimeName = useMemo(() => {
    const found = runtimes.find((r) => r.id === runtimeId);
    if (found?.name) return found.name;
    if (runtimeId === "mock") return "Mock";
    return runtimeId;
  }, [runtimes, runtimeId]);

  const clearFeedbackSoon = useCallback(() => {
    window.setTimeout(() => setFeedback(null), 3200);
  }, []);

  const onExport = async () => {
    if (!focusId || busy) return;
    setBusy(true);
    setFeedback(null);
    setFallbackMd(null);
    try {
      const brief = await exportCardBrief(focusId);
      const md = cardBriefToMarkdown(brief);
      const mode = await copyWithFallback(md);
      if (mode === "clipboard") {
        setFeedback({ kind: "ok", text: "任务单已复制到剪贴板" });
      } else {
        setFallbackMd(md);
        setFeedback({
          kind: "ok",
          text: "无法写剪贴板，请手动复制下方文本",
        });
      }
      clearFeedbackSoon();
    } catch (e) {
      setFeedback({
        kind: "err",
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const onImportSubmit = async () => {
    const raw = importText.trim();
    if (!raw || locked) return;
    setBusy(true);
    setFeedback(null);
    try {
      await importAssistantToFocus(raw);
      setImportText("");
      setImportOpen(false);
      setFeedback({ kind: "ok", text: "已导入为当前卡一轮" });
      clearFeedbackSoon();
    } catch (e) {
      setFeedback({
        kind: "err",
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const onHandoff = async () => {
    if (locked) return;
    if (!handoffConfirm) {
      setHandoffConfirm(true);
      return;
    }
    setHandoffConfirm(false);
    setBusy(true);
    setFeedback(null);
    try {
      await startRuntimeHandoff({ runtimeId });
      setFeedback({ kind: "ok", text: `已交给 ${runtimeName}` });
      clearFeedbackSoon();
    } catch (e) {
      setFeedback({
        kind: "err",
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ic-agent-menu">
      <div className="ic-agent-menu-bar" role="toolbar" aria-label="Agent 任务">
        <button
          type="button"
          className="ic-agent-btn"
          data-tip="导出本卡任务单（Markdown）"
          disabled={busy || !focusId}
          onClick={() => void onExport()}
        >
          导出任务单
        </button>
        <button
          type="button"
          className={`ic-agent-btn${importOpen ? " on" : ""}`}
          data-tip="粘贴外部 Agent 回复到本卡"
          disabled={locked && !importOpen}
          aria-expanded={importOpen}
          onClick={() => {
            setImportOpen((v) => !v);
            setHandoffConfirm(false);
            setFallbackMd(null);
          }}
        >
          粘贴导入
        </button>
        <button
          type="button"
          className={`ic-agent-btn handoff${handoffConfirm ? " confirm" : ""}`}
          data-tip={
            handoffConfirm
              ? `确认交给 ${runtimeName}`
              : `交给本地 Agent（${runtimeName}）`
          }
          disabled={locked && !handoffConfirm}
          onClick={() => void onHandoff()}
        >
          {handoffConfirm ? `确认 · ${runtimeName}` : "交给本地 Agent"}
        </button>
        {handoffConfirm ? (
          <button
            type="button"
            className="ic-agent-btn ghost"
            onClick={() => setHandoffConfirm(false)}
          >
            取消
          </button>
        ) : null}
      </div>

      {importOpen ? (
        <div className="ic-agent-panel">
          <label className="ic-agent-import-label">
            <span>粘贴外部 Agent 回复</span>
            <textarea
              value={importText}
              rows={4}
              placeholder="Markdown / 纯文本；[[术语]] 会保留为标记"
              disabled={busy}
              onChange={(e) => setImportText(e.target.value)}
            />
          </label>
          <div className="ic-agent-panel-actions">
            <button
              type="button"
              className="ic-agent-btn ghost"
              disabled={busy}
              onClick={() => {
                setImportOpen(false);
                setImportText("");
              }}
            >
              关闭
            </button>
            <button
              type="button"
              className="ic-agent-btn primary"
              disabled={busy || !importText.trim() || locked}
              onClick={() => void onImportSubmit()}
            >
              导入本卡
            </button>
          </div>
        </div>
      ) : null}

      {fallbackMd ? (
        <div className="ic-agent-panel">
          <label className="ic-agent-import-label">
            <span>任务单 Markdown</span>
            <textarea
              value={fallbackMd}
              rows={6}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
          <div className="ic-agent-panel-actions">
            <button
              type="button"
              className="ic-agent-btn ghost"
              onClick={() => setFallbackMd(null)}
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <p
          className={`ic-agent-feedback${feedback.kind === "err" ? " err" : ""}`}
          role="status"
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
