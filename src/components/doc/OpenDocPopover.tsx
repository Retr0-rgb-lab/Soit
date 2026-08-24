import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useWorkspace } from "../../state/workspaceStore";

const RECENT_KEY = "soit-doc-recent";
const RECENT_MAX = 5;

type Props = {
  open: boolean;
  onClose: () => void;
};

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim())
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function pushRecent(path: string): void {
  const next = [
    path,
    ...readRecent().filter((p) => p.toLowerCase() !== path.toLowerCase()),
  ].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

export default function OpenDocPopover({ open, onClose }: Props) {
  const openDoc = useWorkspace((s) => s.openDoc);
  const vaultPath = useWorkspace((s) => s.vaultPath);
  const leave = useWorkspace((s) => s.leave);
  const spaceBusy = useWorkspace((s) => s.spaceBusy);
  const shellPhase = useWorkspace((s) => s.shellPhase);

  const [path, setPath] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const unbound = !vaultPath;
  const leaveBusy =
    spaceBusy || shellPhase === "entering" || shellPhase === "leaving";

  useEffect(() => {
    if (!open) return;
    setPath("");
    setBusy(false);
    setRecent(readRecent());
    const t = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [open]);

  const submitPath = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      try {
        pushRecent(trimmed);
        setRecent(readRecent());
        await openDoc(trimmed);
        onClose();
      } finally {
        setBusy(false);
      }
    },
    [busy, openDoc, onClose],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitPath(path);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="open-doc-root"
      role="dialog"
      aria-modal="true"
      aria-label="打开文档"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div className="open-doc-pop">
        <h2 className="open-doc-pop__title">打开文档</h2>
        {unbound ? (
          <p className="open-doc-pop__hint">
            尚未进入工作区。请先退出到门厅，选择本机 Obsidian 库后再打开文档。
          </p>
        ) : (
          <p className="open-doc-pop__hint">
            输入相对 vault 的路径（如{" "}
            <code>notes/intro.md</code>
            ）。只读陪读，编辑请回 Obsidian。
          </p>
        )}

        {unbound ? (
          <div className="open-doc-pop__row">
            <button
              type="button"
              className="open-doc-pop__btn"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="open-doc-pop__btn is-primary"
              disabled={leaveBusy}
              onClick={() => {
                onClose();
                void leave();
              }}
            >
              {shellPhase === "leaving" ? "退出中…" : "退出工作区"}
            </button>
          </div>
        ) : (
          <form className="open-doc-pop__form" onSubmit={onSubmit}>
            <input
              ref={inputRef}
              className="open-doc-pop__input"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="notes/intro.md"
              aria-label="文档路径"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
            <div className="open-doc-pop__row">
              <button
                type="button"
                className="open-doc-pop__btn"
                onClick={onClose}
                disabled={busy}
              >
                取消
              </button>
              <button
                type="submit"
                className="open-doc-pop__btn is-primary"
                disabled={busy || !path.trim()}
              >
                {busy ? "打开中…" : "打开"}
              </button>
            </div>
          </form>
        )}

        {!unbound && recent.length > 0 ? (
          <div>
            <p className="open-doc-pop__recent-label">最近</p>
            <ul className="open-doc-pop__recent">
              {recent.map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    className="open-doc-pop__recent-item"
                    title={p}
                    disabled={busy}
                    onClick={() => void submitPath(p)}
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
