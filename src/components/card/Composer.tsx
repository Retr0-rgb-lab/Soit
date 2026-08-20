import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  ATTACH_MAX_BYTES,
  ATTACH_MAX_FILES,
  ATTACH_TEXT_CAP,
  buildComposerUserBody,
  formatBytes,
  isProbablyTextFile,
  mentionQueryAt,
  stripMentionToken,
  type ComposerAttachment,
  type ComposerCardRef,
} from "../../lib/composerPayload";
import {
  activeModelLabel,
  DEFAULT_CHAT_CONFIG,
  emptyModelSettings,
  portKindFromConfig,
  resolveChatConfig,
  stripHtml,
  type ChatConfig,
  type ModelEntry,
  type ModelSettings,
} from "../../lib/chat";
import {
  getChatConfig,
  getModelSettings,
  setModelSettings,
} from "../../lib/host";
import { rankPaletteNodes } from "../../lib/paletteRank";
import { kindGlyph } from "../../lib/treeNav";
import { useWorkspace } from "../../state/workspaceStore";
import {
  IconAttach,
  IconAt,
  IconModel,
  IconSend,
  IconX,
} from "./icons";

/** Astryx Typeahead maxMenuItems / TypeaheadLimitedResults density. */
const MENTION_MENU_CAP = 6;

interface Props {
  draft: string;
  quote: string;
  onDraftChange: (v: string) => void;
  onClearQuote: () => void;
  /** Full user body (quote / refs / attachments already folded in). */
  onSend: (body: string) => void;
  disabled?: boolean;
}

function nextAttId(): string {
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function modelEntryLabel(m: ModelEntry): string {
  return (m.label && m.label.trim()) || m.modelId;
}

function modelTriggerTip(
  cfg: ChatConfig,
  displayName: string | null,
  catalogCount: number,
): string {
  if (portKindFromConfig(cfg) === "openai") {
    const name = displayName?.trim() || cfg.model || "模型";
    return `${name} · 点击切换`;
  }
  if (catalogCount === 0) return "添加并选择对话模型";
  return "尚未选用模型 · 点击切换（当前本地预览）";
}

export default function Composer({
  draft,
  quote,
  onDraftChange,
  onClearQuote,
  onSend,
  disabled,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const [cfg, setCfg] = useState<ChatConfig>({ ...DEFAULT_CHAT_CONFIG });
  const [modelDisplay, setModelDisplay] = useState<string | null>(null);
  const [modelSettings, setModelSettingsState] = useState<ModelSettings>(
    emptyModelSettings(),
  );
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelSwitching, setModelSwitching] = useState(false);

  const nodes = useWorkspace((s) => s.nodes);
  const focusId = useWorkspace((s) => s.focusId);
  const recentIds = useWorkspace((s) => s.recentIds);
  const turnsByCardId = useWorkspace((s) => s.turnsByCardId);
  const inquiryInflight = useWorkspace((s) => s.inquiryInflight);
  const runtimeRun = useWorkspace((s) => s.runtimeRun);
  const cancelInflight = useWorkspace((s) => s.cancelInflight);
  const cancelRuntimeHandoff = useWorkspace((s) => s.cancelRuntimeHandoff);

  const [cardRefs, setCardRefs] = useState<ComposerCardRef[]>([]);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerActive, setPickerActive] = useState(0);
  const [mentionSpan, setMentionSpan] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);

  const runtimeBusy =
    runtimeRun?.status === "staging" || runtimeRun?.status === "running";
  const generating = Boolean(inquiryInflight) || runtimeBusy;
  const inputLocked = Boolean(disabled) || generating;

  const canSend =
    Boolean(draft.trim()) ||
    Boolean(quote.trim()) ||
    cardRefs.length > 0 ||
    attachments.length > 0;

  const kind = portKindFromConfig(cfg);
  const enabledModels = useMemo(
    () => modelSettings.models.filter((m) => m.enabled),
    [modelSettings.models],
  );

  const reloadConfig = useCallback(async () => {
    try {
      const settings = await getModelSettings();
      setModelSettingsState(settings);
      setModelDisplay(activeModelLabel(settings));
      setCfg(resolveChatConfig(settings));
    } catch {
      const c = await getChatConfig();
      setCfg(c);
      setModelDisplay(c.model.trim() || null);
      setModelSettingsState(emptyModelSettings());
    }
  }, []);

  useEffect(() => {
    void reloadConfig();
  }, [reloadConfig]);

  useEffect(() => {
    const onChanged = () => {
      void reloadConfig();
    };
    window.addEventListener("soit:chat-config-changed", onChanged);
    return () =>
      window.removeEventListener("soit:chat-config-changed", onChanged);
  }, [reloadConfig]);

  const applyActiveModel = useCallback(
    async (activeModelId: string | null) => {
      if (modelSwitching) return;
      if (modelSettings.activeModelId === activeModelId) {
        setModelMenuOpen(false);
        return;
      }
      setModelSwitching(true);
      try {
        const next = { ...modelSettings, activeModelId };
        await setModelSettings(next);
        setModelSettingsState(next);
        setModelDisplay(activeModelLabel(next));
        setCfg(resolveChatConfig(next));
        window.dispatchEvent(new CustomEvent("soit:chat-config-changed"));
        setModelMenuOpen(false);
      } catch {
        await reloadConfig();
      } finally {
        setModelSwitching(false);
      }
    },
    [modelSettings, modelSwitching, reloadConfig],
  );

  const openModelSettings = useCallback(() => {
    setModelMenuOpen(false);
    window.dispatchEvent(
      new CustomEvent("soit:open-settings", {
        detail: { section: "model" },
      }),
    );
  }, []);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(120, el.scrollHeight)}px`;
  }, [draft]);

  // Clear ephemeral chips when focus card changes.
  useEffect(() => {
    setCardRefs([]);
    setAttachments([]);
    setPickerOpen(false);
    setModelMenuOpen(false);
    setMentionSpan(null);
    setAttachError(null);
  }, [focusId]);

  const candidates = useMemo(() => {
    const { items } = rankPaletteNodes({
      nodes,
      query: pickerQuery,
      focusId,
      recentIds,
      cap: MENTION_MENU_CAP + 4,
    });
    const taken = new Set(cardRefs.map((r) => r.id));
    return items
      .filter((n) => n.id !== focusId && !taken.has(n.id))
      .slice(0, MENTION_MENU_CAP);
  }, [nodes, pickerQuery, focusId, recentIds, cardRefs]);

  useEffect(() => {
    setPickerActive(0);
  }, [pickerQuery, pickerOpen, candidates.length]);

  const snippetFor = useCallback(
    (cardId: string): string | undefined => {
      const turns = turnsByCardId[cardId] ?? [];
      if (!turns.length) return undefined;
      const t = turns[turns.length - 1]!;
      const bits: string[] = [];
      if (t.user?.trim()) bits.push(`用户：${t.user.trim()}`);
      const ai = stripHtml(t.aiHtml ?? "").trim();
      if (ai) bits.push(`助手：${ai}`);
      return bits.join("\n") || undefined;
    },
    [turnsByCardId],
  );

  const openPicker = useCallback((query = "", span: { start: number; end: number } | null = null) => {
    setPickerQuery(query);
    setMentionSpan(span);
    setPickerOpen(true);
    setPickerActive(0);
  }, []);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setMentionSpan(null);
    setPickerQuery("");
  }, []);

  const pickCard = useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.id === id);
      if (!node || node.id === focusId) return;
      if (cardRefs.some((r) => r.id === id)) {
        closePicker();
        return;
      }
      setCardRefs((prev) => [
        ...prev,
        {
          id: node.id,
          title: node.title,
          snippet: snippetFor(node.id),
        },
      ]);
      if (mentionSpan && taRef.current) {
        const cursor = taRef.current.selectionStart ?? draft.length;
        const end = Math.max(cursor, mentionSpan.end);
        const stripped = stripMentionToken(draft, mentionSpan.start, end);
        onDraftChange(stripped.value);
        requestAnimationFrame(() => {
          const el = taRef.current;
          if (!el) return;
          el.focus();
          el.setSelectionRange(stripped.cursor, stripped.cursor);
        });
      } else {
        taRef.current?.focus();
      }
      closePicker();
    },
    [
      nodes,
      focusId,
      cardRefs,
      mentionSpan,
      draft,
      onDraftChange,
      snippetFor,
      closePicker,
    ],
  );

  const removeCardRef = useCallback((id: string) => {
    setCardRefs((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const readFile = (file: File): Promise<ComposerAttachment> =>
    new Promise((resolve, reject) => {
      const base = {
        id: nextAttId(),
        name: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
      };
      if (file.size > ATTACH_MAX_BYTES) {
        reject(new Error(`「${file.name}」超过 ${formatBytes(ATTACH_MAX_BYTES)}`));
        return;
      }
      if (!isProbablyTextFile(file.name, file.type)) {
        resolve(base);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        let text = String(reader.result ?? "");
        if (text.length > ATTACH_TEXT_CAP) {
          text = `${text.slice(0, ATTACH_TEXT_CAP)}\n…(截断)`;
        }
        resolve({ ...base, text });
      };
      reader.onerror = () => reject(new Error(`无法读取「${file.name}」`));
      reader.readAsText(file);
    });

  const addFiles = useCallback(async (list: FileList | File[]) => {
    const files = Array.from(list);
    if (!files.length) return;
    setAttachError(null);

    let baseLen = 0;
    setAttachments((prev) => {
      baseLen = prev.length;
      return prev;
    });

    const room = ATTACH_MAX_FILES - baseLen;
    if (room <= 0) {
      setAttachError(`最多 ${ATTACH_MAX_FILES} 个附件`);
      return;
    }
    const slice = files.slice(0, room);
    if (files.length > room) {
      setAttachError(`最多 ${ATTACH_MAX_FILES} 个附件，已忽略多余文件`);
    }

    const next: ComposerAttachment[] = [];
    for (const f of slice) {
      try {
        next.push(await readFile(f));
      } catch (e) {
        setAttachError(e instanceof Error ? e.message : String(e));
      }
    }
    if (next.length) {
      setAttachments((p) => [...p, ...next].slice(0, ATTACH_MAX_FILES));
    }
  }, []);

  const onStop = useCallback(() => {
    if (inquiryInflight) {
      cancelInflight();
      return;
    }
    if (runtimeBusy) {
      void cancelRuntimeHandoff();
    }
  }, [inquiryInflight, runtimeBusy, cancelInflight, cancelRuntimeHandoff]);

  const doSend = useCallback(() => {
    if (inputLocked || !canSend) return;
    // Refresh snippets at send time.
    const refs = cardRefs.map((r) => ({
      ...r,
      snippet: snippetFor(r.id) ?? r.snippet,
    }));
    const body = buildComposerUserBody({
      text: draft,
      quote,
      cardRefs: refs,
      attachments,
    });
    if (!body.trim()) return;
    onSend(body);
    onDraftChange("");
    onClearQuote();
    setCardRefs([]);
    setAttachments([]);
    setAttachError(null);
    closePicker();
  }, [
    inputLocked,
    canSend,
    cardRefs,
    snippetFor,
    draft,
    quote,
    attachments,
    onSend,
    onDraftChange,
    onClearQuote,
    closePicker,
  ]);

  const syncMentionFromCaret = useCallback(
    (value: string, cursor: number) => {
      const hit = mentionQueryAt(value, cursor);
      if (hit) {
        openPicker(hit.query, { start: hit.start, end: cursor });
      } else if (mentionSpan) {
        // Only auto-close when we were in an @ token.
        closePicker();
      }
    },
    [openPicker, closePicker, mentionSpan],
  );

  const onDraftInput = (value: string) => {
    onDraftChange(value);
    const el = taRef.current;
    const cursor = el?.selectionStart ?? value.length;
    const hit = mentionQueryAt(value, cursor);
    if (hit) {
      openPicker(hit.query, { start: hit.start, end: cursor });
    } else if (pickerOpen && mentionSpan) {
      closePicker();
    }
  };

  const onTaKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (pickerOpen && candidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPickerActive((i) => (i + 1) % candidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPickerActive((i) => (i - 1 + candidates.length) % candidates.length);
        return;
      }
      // Enter confirms mention; Shift+Enter falls through to newline.
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const n = candidates[pickerActive];
        if (n) pickCard(n.id);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closePicker();
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const n = candidates[pickerActive];
        if (n) pickCard(n.id);
        return;
      }
    }

    // Enter = send · Shift+Enter = newline
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!generating) doSend();
      return;
    }

    // Bare @ with empty selection opens picker (button parity).
    if (e.key === "@" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Let char insert, then open on next tick via onChange — also force open:
      requestAnimationFrame(() => {
        const el = taRef.current;
        if (!el) return;
        const cursor = el.selectionStart ?? el.value.length;
        syncMentionFromCaret(el.value, cursor);
      });
    }
  };

  // Click outside picker
  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (pickerRef.current?.contains(t)) return;
      if (taRef.current?.contains(t)) return;
      closePicker();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pickerOpen, closePicker]);

  // Click outside model menu
  useEffect(() => {
    if (!modelMenuOpen) return;
    const onDoc = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (modelMenuRef.current?.contains(t)) return;
      setModelMenuOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        setModelMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [modelMenuOpen]);

  const stopTip = inquiryInflight
    ? "停止生成"
    : runtimeBusy
      ? "停止本地 Agent"
      : "停止";

  const providerLabel = (providerId: string) =>
    modelSettings.providers.find((p) => p.id === providerId)?.name ?? "供应商";

  return (
    <div className="ic-dock-wrap">
      <div
        className={`ic-dock${pickerOpen || modelMenuOpen ? " picker-open" : ""}`}
      >
        <div className="fields">
          {quote ? (
            <div className="ic-quote-chip on">
              <span>
                引用 · {quote.slice(0, 48)}
                {quote.length > 48 ? "…" : ""}
              </span>
              <button
                type="button"
                data-tip="去掉引用"
                onClick={onClearQuote}
                aria-label="去掉引用"
              >
                ×
              </button>
            </div>
          ) : null}

          {(cardRefs.length > 0 || attachments.length > 0) && (
            <div className="ic-chip-row" aria-label="已附加">
              {cardRefs.map((r) => (
                <span key={r.id} className="ic-ref-chip" title={r.id}>
                  <span className="ic-ref-at">@</span>
                  <span className="ic-ref-title">{r.title}</span>
                  <button
                    type="button"
                    aria-label={`移除引用 ${r.title}`}
                    disabled={inputLocked}
                    onClick={() => removeCardRef(r.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
              {attachments.map((a) => (
                <span
                  key={a.id}
                  className="ic-att-chip"
                  title={
                    a.text != null
                      ? `${a.name}（已读入文本）`
                      : `${a.name}（仅文件名）`
                  }
                >
                  <span className="ic-att-name">{a.name}</span>
                  <span className="ic-att-size">{formatBytes(a.size)}</span>
                  <button
                    type="button"
                    aria-label={`移除附件 ${a.name}`}
                    disabled={inputLocked}
                    onClick={() => removeAttachment(a.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <textarea
            ref={taRef}
            value={draft}
            placeholder={
              generating
                ? runtimeBusy
                  ? "本地 Agent 执行中…可点停止"
                  : "生成中…可点停止"
                : "写在这张卡上… 输入 @ 引用其他卡片"
            }
            rows={1}
            disabled={inputLocked}
            onChange={(e) => onDraftInput(e.target.value)}
            onKeyDown={onTaKeyDown}
            onSelect={(e) => {
              const el = e.currentTarget;
              if (pickerOpen && mentionSpan) {
                syncMentionFromCaret(el.value, el.selectionStart ?? 0);
              }
            }}
          />

          <div className="ic-dock-toolbar">
            <div className="ic-dock-tools">
              <div className="ic-model-wrap" ref={modelMenuRef}>
                <button
                  type="button"
                  className={`ic-tool-btn ic-model-btn${kind === "mock" ? " is-idle" : " is-live"}${modelMenuOpen ? " on" : ""}`}
                  data-tip={modelTriggerTip(
                    cfg,
                    modelDisplay,
                    enabledModels.length,
                  )}
                  aria-label={
                    kind === "openai" && modelDisplay
                      ? `对话模型：${modelDisplay}`
                      : "选择对话模型"
                  }
                  aria-haspopup="listbox"
                  aria-expanded={modelMenuOpen}
                  disabled={modelSwitching}
                  onClick={() => {
                    setPickerOpen(false);
                    setModelMenuOpen((v) => !v);
                  }}
                >
                  <IconModel />
                </button>

                {modelMenuOpen ? (
                  <div
                    className="ic-model-menu"
                    role="listbox"
                    aria-label="对话模型"
                  >
                    <p className="ic-model-menu-head">对话模型</p>
                    <button
                      type="button"
                      role="option"
                      className={`ic-model-option${kind === "mock" ? " is-active" : ""}`}
                      aria-selected={kind === "mock"}
                      disabled={modelSwitching}
                      onClick={() => void applyActiveModel(null)}
                    >
                      <span className="ic-model-option-title">本地预览</span>
                      <span className="ic-model-option-sub">
                        无密钥 · 占位回复（不调模型）
                      </span>
                    </button>
                    {enabledModels.length === 0 ? (
                      <p className="ic-model-menu-empty">
                        还没有可用模型。先在设置里添加供应商与模型。
                      </p>
                    ) : (
                      <ul className="ic-model-option-list">
                        {enabledModels.map((m) => {
                          const active = modelSettings.activeModelId === m.id;
                          const title = modelEntryLabel(m);
                          return (
                            <li key={m.id}>
                              <button
                                type="button"
                                role="option"
                                className={`ic-model-option${active ? " is-active" : ""}`}
                                aria-selected={active}
                                disabled={modelSwitching}
                                onClick={() => void applyActiveModel(m.id)}
                              >
                                <span className="ic-model-option-title">
                                  {title}
                                </span>
                                <span className="ic-model-option-sub">
                                  {providerLabel(m.providerId)}
                                  {m.label?.trim() ? ` · ${m.modelId}` : ""}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <button
                      type="button"
                      className="ic-model-manage"
                      onClick={openModelSettings}
                    >
                      管理模型…
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="ic-tool-btn"
                data-tip="添加附件"
                aria-label="添加附件"
                disabled={inputLocked || attachments.length >= ATTACH_MAX_FILES}
                onClick={() => fileRef.current?.click()}
              >
                <IconAttach />
              </button>
              <button
                type="button"
                className={`ic-tool-btn${pickerOpen ? " on" : ""}`}
                data-tip="引用卡片 @"
                aria-label="引用卡片"
                disabled={inputLocked}
                onClick={() => {
                  if (pickerOpen && !mentionSpan) {
                    closePicker();
                    return;
                  }
                  openPicker("", null);
                  taRef.current?.focus();
                }}
              >
                <IconAt />
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  const list = e.target.files;
                  if (list?.length) void addFiles(list);
                  e.target.value = "";
                }}
              />
            </div>
            <div className="hint">
              {attachError
                ? attachError
                : generating
                  ? runtimeBusy
                    ? "本地 Agent 执行中"
                    : "Inquiry 生成中"
                  : "Enter 发送 · Shift+Enter 换行 · @ 引用卡片"}
            </div>
          </div>
        </div>

        {generating ? (
          <button
            type="button"
            className="send is-stop"
            data-tip={stopTip}
            aria-label={stopTip}
            onClick={onStop}
          >
            <IconX />
          </button>
        ) : (
          <button
            type="button"
            className="send"
            data-tip="发送"
            aria-label="发送"
            disabled={inputLocked || !canSend}
            onClick={doSend}
          >
            <IconSend />
          </button>
        )}

        {pickerOpen ? (
          <div
            ref={pickerRef}
            className="ic-mention-pop"
            data-size="sm"
            role="listbox"
            aria-label="引用卡片"
          >
            {/* Astryx Typeahead sm: search field + compact dropdown, not a full dock panel */}
            <div className="ic-mention-head">
              {!mentionSpan ? (
                <input
                  className="ic-mention-filter"
                  value={pickerQuery}
                  placeholder="搜索卡片…"
                  aria-label="搜索要引用的卡片"
                  autoFocus
                  onChange={(e) => setPickerQuery(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") {
                      e.preventDefault();
                      closePicker();
                      return;
                    }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setPickerActive((i) =>
                        candidates.length
                          ? (i + 1) % candidates.length
                          : 0,
                      );
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setPickerActive((i) =>
                        candidates.length
                          ? (i - 1 + candidates.length) % candidates.length
                          : 0,
                      );
                      return;
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const n = candidates[pickerActive];
                      if (n) pickCard(n.id);
                    }
                  }}
                />
              ) : (
                <span className="ic-mention-q" title="继续输入以筛选">
                  @{pickerQuery || ""}
                </span>
              )}
            </div>
            {candidates.length === 0 ? (
              <p className="ic-mention-empty">无匹配</p>
            ) : (
              <ul className="ic-mention-list" data-density="compact">
                {candidates.map((n, i) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === pickerActive}
                      className={`ic-mention-item${i === pickerActive ? " active" : ""}`}
                      onMouseEnter={() => setPickerActive(i)}
                      onClick={() => pickCard(n.id)}
                    >
                      <span className="ic-mention-glyph" aria-hidden>
                        {kindGlyph(n.kind)}
                      </span>
                      <span className="ic-mention-title">{n.title}</span>
                      {n.unread ? (
                        <span className="ic-mention-unread">·</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
