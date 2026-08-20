import { useEffect, useMemo, useState } from "react";
import { LIVE_MAX } from "../../lib/liveSet";
import {
  closeUniverse,
  getBootstrapState,
  openUniverse,
} from "../../lib/host";
import { demoSnapshot } from "../../lib/demoSeed";
import { kindGlyph } from "../../lib/treeNav";
import { groupUnreadByThread, isInLiveThread } from "../../lib/threadDebt";
import { buildOrbitModel } from "../../lib/orbitLayout";
import { UNREAD_RAIL_CAP, useWorkspace } from "../../state/workspaceStore";
import FocusOrbit from "./FocusOrbit";

type Props = {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

type AccordionKey = "live" | "recent" | "debt";

function vaultDisplayName(path: string | null): string {
  if (!path) return "未绑定";
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export default function LeftRail({ collapsed = false, onToggleCollapse }: Props) {
  const nodes = useWorkspace((s) => s.nodes);
  const focusId = useWorkspace((s) => s.focusId);
  const recentIds = useWorkspace((s) => s.recentIds);
  const liveIds = useWorkspace((s) => s.liveIds);
  const focusNode = useWorkspace((s) => s.focusNode);
  const pinLive = useWorkspace((s) => s.pinLive);
  const unpinLive = useWorkspace((s) => s.unpinLive);
  const markThreadRead = useWorkspace((s) => s.markThreadRead);
  const workspaceMode = useWorkspace((s) => s.workspaceMode);
  const setMode = useWorkspace((s) => s.setWorkspaceMode);
  const source = useWorkspace((s) => s.source);
  const vaultPath = useWorkspace((s) => s.vaultPath);
  const loadSnapshot = useWorkspace((s) => s.loadSnapshot);
  const setVaultPath = useWorkspace((s) => s.setVaultPath);
  const beginBootLoad = useWorkspace((s) => s.beginBootLoad);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  /** Prompt suggestion after unbind; host lastVault is also kept (close ≠ clear). */
  const [rememberedVault, setRememberedVault] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<AccordionKey, boolean>>({
    live: true,
    recent: false,
    debt: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const boot = await getBootstrapState();
        if (cancelled) return;
        const last = boot.lastVault?.trim() || boot.vault?.trim() || null;
        if (last) setRememberedVault((prev) => prev ?? last);
      } catch {
        // ignore — prompt can stay empty
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const debts = useMemo(
    () => groupUnreadByThread(nodes, focusId),
    [nodes, focusId],
  );

  const debtByRoot = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of debts) m.set(d.rootId, d.unreadCount);
    return m;
  }, [debts]);

  const unreadTotal = useMemo(
    () => nodes.filter((n) => n.unread && n.id !== focusId).length,
    [nodes, focusId],
  );

  const live = useMemo(() => {
    return liveIds
      .map((id) => byId.get(id))
      .filter((n): n is NonNullable<typeof n> => Boolean(n));
  }, [liveIds, byId]);

  /** True MRU only — no node-array padding when recent is short. */
  const recent = useMemo(() => {
    const list: typeof nodes = [];
    const seen = new Set<string>();
    for (const id of recentIds) {
      const n = byId.get(id);
      if (!n || seen.has(id)) continue;
      seen.add(id);
      list.push(n);
      if (list.length >= 8) break;
    }
    return list;
  }, [recentIds, byId]);

  const orbitFocusId = focusId || liveIds[0] || "";
  const orbitModel = useMemo(() => {
    if (!orbitFocusId) return null;
    return buildOrbitModel(nodes, orbitFocusId);
  }, [nodes, orbitFocusId]);

  const open = (id: string) => {
    focusNode(id);
    setMode("focus");
  };

  const toggleSection = (key: AccordionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const bindVault = async () => {
    const suggested = vaultPath ?? rememberedVault ?? "";
    const path = window.prompt(
      "绑定 Obsidian vault 目录（绝对路径）",
      suggested,
    );
    if (path == null) return;
    const trimmed = path.trim();
    if (!trimmed) return;
    setVaultBusy(true);
    setVaultError(null);
    const epoch = beginBootLoad();
    try {
      const res = await openUniverse(trimmed);
      if (!res.ok || !res.snapshot) {
        setVaultError(res.error ?? "打开本库失败");
        return;
      }
      // Host persists lastVault on success; keep local memory for re-bind UX.
      setRememberedVault(res.path);
      setVaultPath(res.path);
      loadSnapshot(res.snapshot, epoch);
    } catch (e) {
      setVaultError(e instanceof Error ? e.message : String(e));
    } finally {
      setVaultBusy(false);
    }
  };

  const unbindVault = async () => {
    setVaultBusy(true);
    setVaultError(null);
    const epoch = beginBootLoad();
    try {
      // Remember path for prompt; Host lastVault is intentionally not cleared.
      if (vaultPath) setRememberedVault(vaultPath);
      await closeUniverse();
      setVaultPath(null);
      loadSnapshot(demoSnapshot(), epoch);
    } catch (e) {
      setVaultError(e instanceof Error ? e.message : String(e));
    } finally {
      setVaultBusy(false);
    }
  };

  return (
    <aside
      className={`left-rail${collapsed ? " collapsed" : ""}`}
      aria-label="left rail"
    >
      <div className="rail-head">
        <div className="rail-brand">
          <img
            className="rail-logo"
            src="/soit-mark.svg"
            width={28}
            height={28}
            alt=""
            draggable={false}
          />
          {!collapsed && (
            <div className="rail-brand-text">
              <p className="shell-label">Soit</p>
              <h2 className="shell-title">探究</h2>
            </div>
          )}
        </div>
        <button
          type="button"
          className="rail-toggle"
          aria-label={collapsed ? "显示侧栏" : "隐藏侧栏"}
          aria-expanded={!collapsed}
          onClick={onToggleCollapse}
          title={collapsed ? "显示侧栏" : "隐藏侧栏"}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {collapsed ? (
        <div className="rail-icon-col">
          <div className="rail-hud-stack" aria-label="注意力摘要">
            <span
              className="rail-hud-badge"
              title={`活线 ${live.length}`}
              aria-label={`活线 ${live.length}`}
            >
              {live.length}
            </span>
            {unreadTotal > 0 && (
              <span
                className="rail-hud-badge debt"
                title={`未读 ${unreadTotal}`}
                aria-label={`未读 ${unreadTotal}`}
              >
                {unreadTotal > 99 ? "99+" : unreadTotal}
              </span>
            )}
          </div>
          <button
            type="button"
            className={`rail-icon-btn${workspaceMode === "map" ? " on" : ""}`}
            title="图谱"
            aria-label="图谱"
            onClick={() =>
              setMode(workspaceMode === "map" ? "focus" : "map")
            }
          >
            ◎
          </button>
          <button
            type="button"
            className="rail-icon-btn"
            title="跳转 Ctrl+K"
            aria-label="跳转卡片"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("soit:open-palette"))
            }
          >
            ⌕
          </button>
        </div>
      ) : (
        <>
          <div className="rail-vault compact" aria-label="vault bind">
            <span className="rail-vault-kicker">本库</span>
            <p className="rail-vault-name" title={vaultPath ?? undefined}>
              {vaultDisplayName(vaultPath)}
            </p>
            <div className="rail-vault-actions">
              <button
                type="button"
                className="rail-action"
                onClick={() => void bindVault()}
                disabled={vaultBusy}
              >
                {vaultPath ? "换库" : "绑定"}
              </button>
              {vaultPath && (
                <button
                  type="button"
                  className="rail-action ghost"
                  onClick={() => void unbindVault()}
                  disabled={vaultBusy}
                  title="解绑"
                >
                  ×
                </button>
              )}
            </div>
            {vaultError && (
              <p className="rail-vault-error" role="alert">
                {vaultError}
              </p>
            )}
          </div>

          <div className="rail-scroll">
            <section className="rail-acc">
              <button
                type="button"
                className="rail-acc-head"
                aria-expanded={openSections.live}
                onClick={() => toggleSection("live")}
              >
                <span className="rail-acc-chevron" aria-hidden>
                  {openSections.live ? "▾" : "▸"}
                </span>
                <span className="rail-section-label">
                  活线 {live.length}/{LIVE_MAX}
                </span>
              </button>
              <div
                className={`rail-acc-body${openSections.live ? " open" : ""}`}
              >
                <div className="rail-acc-inner">
                  {live.length === 0 ? (
                    <p className="shell-placeholder">打开卡片会自动进入活线</p>
                  ) : (
                    <>
                      {/* Multi-root switcher only — single live root is the orbit center */}
                      {live.length > 1 && (
                        <ul className="node-list rail-live-roots">
                          {live.map((n) => {
                            const debt = debtByRoot.get(n.id) ?? 0;
                            const isOrbitRoot =
                              orbitModel?.rootId === n.id ||
                              (!orbitModel && n.id === liveIds[0]);
                            return (
                              <li key={n.id} className="rail-live-row">
                                <button
                                  type="button"
                                  className={`rail-item${isOrbitRoot ? " on" : ""}`}
                                  onClick={() => open(n.id)}
                                  title={n.title}
                                >
                                  <span className="node-kind" aria-hidden>
                                    {kindGlyph(n.kind)}
                                  </span>
                                  {n.title}
                                </button>
                                {debt > 0 && (
                                  <span
                                    className="rail-debt-badge"
                                    title={`${debt} 未读`}
                                    aria-label={`${debt} 未读`}
                                  >
                                    {debt}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  className="rail-mini"
                                  title="移出活线（注意力，不改探究状态）"
                                  aria-label={`移出活线 ${n.title}`}
                                  onClick={() => unpinLive(n.id)}
                                >
                                  ×
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {orbitModel?.center ? (
                        <FocusOrbit
                          model={orbitModel}
                          onSelect={open}
                          onUnpinCenter={
                            live.some((n) => n.id === orbitModel.center?.id)
                              ? (id) => unpinLive(id)
                              : undefined
                          }
                        />
                      ) : (
                        <ul className="node-list">
                          {live.map((n) => (
                            <li key={n.id} className="rail-live-row">
                              <button
                                type="button"
                                className={`rail-item${n.id === focusId ? " on" : ""}`}
                                onClick={() => open(n.id)}
                                title={n.title}
                              >
                                <span className="node-kind" aria-hidden>
                                  {kindGlyph(n.kind)}
                                </span>
                                {n.title}
                              </button>
                              <button
                                type="button"
                                className="rail-mini"
                                title="移出活线（注意力，不改探究状态）"
                                aria-label={`移出活线 ${n.title}`}
                                onClick={() => unpinLive(n.id)}
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>

            <section className="rail-acc">
              <button
                type="button"
                className="rail-acc-head"
                aria-expanded={openSections.recent}
                onClick={() => toggleSection("recent")}
              >
                <span className="rail-acc-chevron" aria-hidden>
                  {openSections.recent ? "▾" : "▸"}
                </span>
                <span className="rail-section-label">
                  最近{recent.length > 0 ? ` · ${recent.length}` : ""}
                </span>
              </button>
              <div
                className={`rail-acc-body${openSections.recent ? " open" : ""}`}
              >
                <div className="rail-acc-inner">
                  {recent.length === 0 ? (
                    <p className="shell-placeholder">尚无最近</p>
                  ) : (
                    <ul className="node-list">
                      {recent.map((n) => (
                        <li key={n.id} className="rail-live-row">
                          <button
                            type="button"
                            className={`rail-item${n.id === focusId ? " on" : ""}${n.unread ? " unread" : ""}`.replace(
                              /  +/g,
                              " ",
                            )}
                            onClick={() => open(n.id)}
                            title={n.title}
                          >
                            <span className="node-kind" aria-hidden>
                              {kindGlyph(n.kind)}
                            </span>
                            {n.title}
                          </button>
                          {!isInLiveThread(nodes, liveIds, n.id) && (
                            <button
                              type="button"
                              className="rail-mini"
                              title="钉入活线（注意力集合）"
                              aria-label={`钉入活线 ${n.title}`}
                              onClick={() => pinLive(n.id)}
                            >
                              +
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            <section className="rail-acc">
              <button
                type="button"
                className="rail-acc-head"
                aria-expanded={openSections.debt}
                onClick={() => toggleSection("debt")}
              >
                <span className="rail-acc-chevron" aria-hidden>
                  {openSections.debt ? "▾" : "▸"}
                </span>
                <span className="rail-section-label">
                  线债
                  {debts.length > 0
                    ? ` · ${debts.length} 线 · ${unreadTotal} 未读`
                    : ""}
                </span>
                {!openSections.debt && unreadTotal > 0 && (
                  <span className="rail-debt-badge head" aria-hidden>
                    {unreadTotal > 99 ? "99+" : unreadTotal}
                  </span>
                )}
              </button>
              <div
                className={`rail-acc-body${openSections.debt ? " open" : ""}`}
              >
                <div className="rail-acc-inner">
                  {debts.length === 0 ? (
                    <p className="shell-placeholder">无线债</p>
                  ) : (
                    <>
                      <ul className="node-list debt-list">
                        {debts.slice(0, UNREAD_RAIL_CAP).map((d) => {
                          const sample = d.sampleIds[0];
                          const sampleNode = sample
                            ? byId.get(sample)
                            : undefined;
                          return (
                            <li key={d.rootId}>
                              <button
                                type="button"
                                className="debt-row"
                                onClick={() => open(sample ?? d.rootId)}
                                title={d.rootTitle}
                              >
                                <span className="debt-title">{d.rootTitle}</span>
                                <span className="debt-count">{d.unreadCount}</span>
                              </button>
                              {sampleNode && (
                                <p
                                  className="debt-sample"
                                  title={sampleNode.title}
                                >
                                  {sampleNode.title}
                                </p>
                              )}
                              <button
                                type="button"
                                className="debt-skim"
                                onClick={() => markThreadRead(d.rootId)}
                              >
                                本线标已读
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      {debts.length > UNREAD_RAIL_CAP && (
                        <p className="rail-more-unread">
                          还有 {debts.length - UNREAD_RAIL_CAP} 条线 · Ctrl+K
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>
          </div>

          <div className="rail-actions">
            <button
              type="button"
              className={`rail-action${workspaceMode === "map" ? " on" : ""}`}
              onClick={() =>
                setMode(workspaceMode === "map" ? "focus" : "map")
              }
            >
              {workspaceMode === "map" ? "返回卡片" : "图谱"}
            </button>
            <button
              type="button"
              className="rail-action ghost"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("soit:open-palette"))
              }
              title="Ctrl+K"
            >
              跳转
            </button>
            <button
              type="button"
              className="rail-action ghost"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("soit:open-skills"))
              }
              title="设置 · 技能"
              disabled={!vaultPath}
            >
              技能
            </button>
          </div>

          <p className="rail-foot-meta">
            {source === "demo"
              ? "演示数据"
              : source === "empty"
                ? "本库 · 空"
                : source === "universe"
                  ? "本库"
                  : (source ?? "—")}
            {" · "}
            {nodes.length} 卡
          </p>
        </>
      )}
    </aside>
  );
}
