import { useEffect, useMemo, useRef, useState } from "react";
import {
  MOCK_HALL_LAST_VAULT,
  MOCK_HALL_WORKSPACES,
} from "../../lib/demoSeed";
import { useWorkspace } from "../../state/workspaceStore";

function vaultLeaf(path: string): string {
  if (path.startsWith("demo://")) {
    return path.slice("demo://".length) || "演示工作区";
  }
  const leaf =
    path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? path;
  return leaf || path;
}

function truncatePath(path: string, max = 52): string {
  const n = path.replace(/\\/g, "/");
  if (n.length <= max) return path;
  const keep = Math.max(12, Math.floor((max - 1) / 2));
  return `${n.slice(0, keep)}…${n.slice(-keep)}`;
}

function isDesktopHost(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

/**
 * Hall — choose vault before AppShell (workspace-hall §2.3).
 * No three-pane chrome, no demo universe, no CDN fonts.
 */
export default function WorkspacePicker() {
  const sessionConfig = useWorkspace((s) => s.sessionConfig);
  const shellPhase = useWorkspace((s) => s.shellPhase);
  const spaceBusy = useWorkspace((s) => s.spaceBusy);
  const enterError = useWorkspace((s) => s.enterError);
  const enter = useWorkspace((s) => s.enter);
  const enterDemo = useWorkspace((s) => s.enterDemo);
  const forget = useWorkspace((s) => s.forget);
  const dismissEnterError = useWorkspace((s) => s.dismissEnterError);

  const sessionRecents = sessionConfig?.recentVaults ?? [];
  const sessionLast = sessionConfig?.lastVault ?? null;

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [userPicked, setUserPicked] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [menuPath, setMenuPath] = useState<string | null>(null);
  /** Browser layout mocks dismissed via ⋯ so list can go empty. */
  const [hiddenMocks, setHiddenMocks] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const desktop = useMemo(() => isDesktopHost(), []);
  const busy = spaceBusy || shellPhase === "entering";

  /** Browser: seed mock workspaces when session has none (layout preview). */
  const usingHallMocks =
    !desktop && sessionRecents.length === 0;
  const recents = useMemo(() => {
    if (!usingHallMocks) return sessionRecents;
    const hide = new Set(hiddenMocks);
    return MOCK_HALL_WORKSPACES.filter((p) => !hide.has(p));
  }, [usingHallMocks, sessionRecents, hiddenMocks]);
  const lastVault = usingHallMocks
    ? MOCK_HALL_LAST_VAULT
    : sessionLast;
  const listEmpty = recents.length === 0;
  const openFormVisible = listEmpty || showOpenForm;

  // Preselect lastVault ?? recentVaults[0] until the user picks.
  useEffect(() => {
    if (userPicked) return;
    const next = (lastVault?.trim() || recents[0] || null) ?? null;
    setSelectedPath(next);
  }, [lastVault, recents, userPicked]);

  useEffect(() => {
    if (listEmpty) setShowOpenForm(true);
  }, [listEmpty]);

  useEffect(() => {
    if (!menuPath) return;
    const onDoc = (e: MouseEvent) => {
      const el = menuRef.current;
      if (el && !el.contains(e.target as Node)) setMenuPath(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuPath]);

  const selectPath = (path: string) => {
    setUserPicked(true);
    setSelectedPath(path);
    setMenuPath(null);
  };

  const enterSelectedWorkspace = () => {
    if (busy) return;
    const p = selectedPath?.trim();
    if (!p) return;
    // Browser / mock hall rows → in-memory demo cards (no real vault).
    if (!desktop || usingHallMocks) {
      void enterDemo();
      return;
    }
    void enter(p);
  };

  const onEnterSelected = () => {
    enterSelectedWorkspace();
  };

  const onEnterPath = () => {
    if (!desktop || busy) return;
    const p = pathInput.trim();
    if (!p) return;
    setUserPicked(true);
    setSelectedPath(p);
    void enter(p);
  };

  const onRetry = () => {
    if (busy) return;
    if (!desktop) {
      void enterDemo();
      return;
    }
    const p = (selectedPath ?? pathInput).trim();
    if (!p) return;
    void enter(p);
  };

  const onForget = (path: string) => {
    setMenuPath(null);
    if (usingHallMocks) {
      setHiddenMocks((h) => (h.includes(path) ? h : [...h, path]));
      if (selectedPath === path) setUserPicked(false);
      return;
    }
    void forget(path).then(() => {
      if (selectedPath === path) {
        setUserPicked(false);
      }
    });
  };

  return (
    <div className="workspace-picker" aria-label="选择工作区">
      <div className="workspace-picker__panel">
        <header className="workspace-picker__head">
          <p className="shell-label">Soit</p>
          <h1 className="workspace-picker__title">选择工作区</h1>
          <p className="workspace-picker__sub">
            一个工作区对应一个本机 Obsidian 库。先选库，再进入探究。
          </p>
        </header>

        {!desktop ? (
          <div className="workspace-picker__banner is-info" role="status">
            <span>
              {usingHallMocks
                ? "浏览器布局预览：下列为示意工作区（非本机真库）。点「进入」会打开内存演示卡片。"
                : "浏览器预览无法打开本机库。点「进入」将打开内存演示卡片；真库请用桌面版。"}
            </span>
          </div>
        ) : null}

        {enterError ? (
          <div className="workspace-picker__banner is-error" role="alert">
            <span className="workspace-picker__banner-text">{enterError}</span>
            <div className="workspace-picker__banner-actions">
              <button
                type="button"
                className="workspace-picker__btn ghost"
                disabled={busy || !desktop}
                onClick={() => onRetry()}
              >
                重试
              </button>
              <button
                type="button"
                className="workspace-picker__btn ghost"
                disabled={busy}
                onClick={() => dismissEnterError()}
              >
                关闭
              </button>
            </div>
          </div>
        ) : null}

        {listEmpty ? (
          <p className="workspace-picker__empty">
            还没有工作区。打开一个 Obsidian 库文件夹即可。
          </p>
        ) : (
          <ul className="workspace-picker__list" role="listbox" aria-label="最近工作区">
            {recents.map((path) => {
              const selected = selectedPath === path;
              const isLast = lastVault != null && lastVault === path;
              return (
                <li key={path} className="workspace-picker__item-wrap">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`workspace-picker__item${selected ? " is-selected" : ""}`}
                    disabled={busy}
                    onClick={() => selectPath(path)}
                    onDoubleClick={() => {
                      selectPath(path);
                      if (busy) return;
                      if (!desktop || usingHallMocks) {
                        void enterDemo();
                        return;
                      }
                      void enter(path);
                    }}
                  >
                    <span className="workspace-picker__item-main">
                      <span className="workspace-picker__item-name">
                        {vaultLeaf(path)}
                        {isLast ? (
                          <span className="workspace-picker__badge">上次</span>
                        ) : null}
                        {usingHallMocks ? (
                          <span className="workspace-picker__badge is-mock">
                            示意
                          </span>
                        ) : null}
                      </span>
                      <span className="workspace-picker__item-path" title={path}>
                        {truncatePath(path)}
                      </span>
                    </span>
                  </button>
                  <div
                    className="workspace-picker__more"
                    ref={menuPath === path ? menuRef : undefined}
                  >
                    <button
                      type="button"
                      className="workspace-picker__more-btn"
                      aria-label="更多"
                      aria-expanded={menuPath === path}
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuPath((cur) => (cur === path ? null : path));
                      }}
                    >
                      ⋯
                    </button>
                    {menuPath === path ? (
                      <div className="workspace-picker__menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          className="workspace-picker__menu-item"
                          onClick={() => onForget(path)}
                        >
                          从列表移除
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {openFormVisible ? (
          <form
            className="workspace-picker__form"
            onSubmit={(e) => {
              e.preventDefault();
              onEnterPath();
            }}
          >
            <label className="workspace-picker__field">
              <span>Vault 绝对路径</span>
              <input
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder="例如：E:\Notes\MyVault"
                disabled={busy || !desktop}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="workspace-picker__actions">
              <button
                type="submit"
                className="workspace-picker__btn primary"
                disabled={busy || !desktop || !pathInput.trim()}
              >
                {busy ? "打开中…" : desktop ? "进入" : "需要桌面版"}
              </button>
              {!listEmpty ? (
                <button
                  type="button"
                  className="workspace-picker__btn ghost"
                  disabled={busy}
                  onClick={() => setShowOpenForm(false)}
                >
                  取消
                </button>
              ) : null}
            </div>
          </form>
        ) : (
          <div className="workspace-picker__actions">
            <button
              type="button"
              className="workspace-picker__btn primary"
              disabled={busy || !selectedPath?.trim()}
              onClick={() => onEnterSelected()}
            >
              {busy
                ? "打开中…"
                : !desktop || usingHallMocks
                  ? "进入演示"
                  : "进入"}
            </button>
            <button
              type="button"
              className="workspace-picker__btn ghost"
              disabled={busy}
              onClick={() => setShowOpenForm(true)}
            >
              打开本机文件夹
            </button>
            {!desktop ? (
              <button
                type="button"
                className="workspace-picker__btn ghost"
                disabled={busy}
                onClick={() => void enterDemo()}
              >
                直接进演示卡片
              </button>
            ) : null}
          </div>
        )}

        {desktop ? (
          <p className="workspace-picker__hint">
            开发调试也可进入内存演示（不写 lastVault）：
            <button
              type="button"
              className="workspace-picker__link"
              disabled={busy}
              onClick={() => void enterDemo()}
            >
              演示工作区
            </button>
          </p>
        ) : null}

        {busy ? (
          <p className="workspace-picker__busy" aria-live="polite">
            正在打开工作区…
          </p>
        ) : null}
      </div>
    </div>
  );
}
