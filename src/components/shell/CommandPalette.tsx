import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { PALETTE_RESULT_CAP, rankPaletteNodes } from "../../lib/paletteRank";
import { kindGlyph } from "../../lib/treeNav";
import { useWorkspace } from "../../state/workspaceStore";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function CommandPalette({ open, onClose }: Props) {
  const nodes = useWorkspace((s) => s.nodes);
  const focusId = useWorkspace((s) => s.focusId);
  const recentIds = useWorkspace((s) => s.recentIds);
  const focusNode = useWorkspace((s) => s.focusNode);
  const setMode = useWorkspace((s) => s.setWorkspaceMode);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const { ranked, totalMatched } = useMemo(() => {
    const { items, totalMatched: total } = rankPaletteNodes({
      nodes,
      query,
      focusId,
      recentIds,
      cap: PALETTE_RESULT_CAP,
    });
    return { ranked: items, totalMatched: total };
  }, [nodes, query, focusId, recentIds]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${active}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = useCallback(
    (id: string) => {
      focusNode(id);
      setMode("focus");
      onClose();
    },
    [focusNode, setMode, onClose],
  );

  const onKeyDown = (e: ReactKeyboardEvent) => {
    // Let AppShell still toggle closed via Ctrl/Cmd+K
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === "k" || e.key === "K")) return;
    // Keep map/shell window handlers from double-handling while open
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(0, ranked.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const n = ranked[active];
      if (n) pick(n.id);
    }
  };

  if (!open) return null;

  return (
    <div
      className="cmd-palette-root"
      role="dialog"
      aria-modal="true"
      aria-label="跳转到卡片"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cmd-palette" onKeyDown={onKeyDown}>
        <div className="cmd-palette-input-row">
          <span className="cmd-palette-hint" aria-hidden>
            ⌕
          </span>
          <input
            ref={inputRef}
            className="cmd-palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="跳转到卡片…"
            aria-label="搜索卡片标题"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="cmd-palette-kbd">Esc</kbd>
        </div>
        <ul className="cmd-palette-list" ref={listRef} role="listbox">
          {ranked.length === 0 ? (
            <li className="cmd-palette-empty">没有匹配的卡片</li>
          ) : (
            ranked.map((n, i) => (
              <li key={n.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  data-idx={i}
                  className={`cmd-palette-item${i === active ? " on" : ""}${n.id === focusId ? " current" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(n.id)}
                >
                  <span className="cmd-kind" aria-hidden>
                    {kindGlyph(n.kind)}
                  </span>
                  <span className="cmd-title">{n.title}</span>
                  {n.unread && <span className="cmd-unread">未读</span>}
                  {n.id === focusId && (
                    <span className="cmd-current">当前</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="cmd-palette-foot">
          ↑↓ 选择 · Enter 打开 · Ctrl+K 开关
          {totalMatched > ranked.length
            ? ` · 显示 ${ranked.length}/${totalMatched}，继续输入以缩小`
            : ""}
        </p>
      </div>
    </div>
  );
}
