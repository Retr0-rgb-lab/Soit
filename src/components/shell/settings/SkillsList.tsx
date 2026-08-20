import { useCallback, useEffect, useState } from "react";
import { listSkills, setSkillEnabled } from "../../../lib/host";
import type { SkillInfo } from "../../../types";
import { useWorkspace } from "../../../state/workspaceStore";

type Props = {
  /** @deprecated Prefer leave → hall; kept for SettingsPanel optional prop. */
  onNeedVault?: () => void;
};

/**
 * Settings · 技能 — list/toggle/refresh only (no fullscreen root, no Esc).
 * Unbound CTA → 门厅 / leave，not settings·空间 as hall (workspace-hall §2.6).
 */
export default function SkillsList({ onNeedVault: _onNeedVault }: Props) {
  const vaultPath = useWorkspace((s) => s.vaultPath);
  const leave = useWorkspace((s) => s.leave);
  const spaceBusy = useWorkspace((s) => s.spaceBusy);
  const shellPhase = useWorkspace((s) => s.shellPhase);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const leaveBusy =
    spaceBusy || shellPhase === "entering" || shellPhase === "leaving";

  const refresh = useCallback(async () => {
    if (!vaultPath) {
      setSkills([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listSkills();
      setSkills(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, [vaultPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const goHall = () => {
    void leave();
  };

  const toggle = async (skill: SkillInfo) => {
    if (!vaultPath || busyId) return;
    setBusyId(skill.id);
    setError(null);
    try {
      const next = await setSkillEnabled(skill.id, !skill.enabled);
      setSkills(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="settings-skills" aria-label="技能">
      <header className="settings-section-intro">
        <h3 className="settings-section-title">技能</h3>
        <p className="settings-section-desc">
          SKILL.md 即配置。启停只影响本库，没有技能市场。
        </p>
      </header>

      {!vaultPath ? (
        <div className="settings-empty-block">
          <p>请先在门厅选择工作区，才能管理该库下的技能。</p>
          <button
            type="button"
            className="settings-btn primary"
            disabled={leaveBusy}
            onClick={goHall}
          >
            {shellPhase === "leaving" ? "退出中…" : "退出工作区"}
          </button>
        </div>
      ) : loading && skills.length === 0 ? (
        <div className="settings-empty-block">
          <p>加载中…</p>
        </div>
      ) : skills.length === 0 ? (
        <div className="settings-empty-block">
          <p>本库暂无技能。可在 vault/.soit/skills/ 放入 SKILL.md。</p>
        </div>
      ) : (
        <ul className="skills-list">
          {skills.map((s) => (
            <li key={s.id} className="skills-row">
              <div className="skills-meta">
                <span className="skills-name">{s.name || s.id}</span>
                {s.description ? (
                  <span className="skills-desc">{s.description}</span>
                ) : null}
                <span className="skills-id">{s.id}</span>
              </div>
              <button
                type="button"
                className={`skills-toggle${s.enabled ? " on" : ""}`}
                role="switch"
                aria-checked={s.enabled}
                aria-label={`${s.enabled ? "停用" : "启用"} ${s.name || s.id}`}
                disabled={busyId === s.id}
                onClick={() => void toggle(s)}
              >
                {s.enabled ? "开" : "关"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className="skills-panel-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
