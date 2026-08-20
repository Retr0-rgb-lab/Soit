import { useCallback, useEffect, useState } from "react";
import { listSkills, setSkillEnabled } from "../../../lib/host";
import type { SkillInfo } from "../../../types";
import { useWorkspace } from "../../../state/workspaceStore";

type Props = {
  /** Prefer jumping to space tab inside the open settings modal. */
  onNeedVault?: () => void;
};

/**
 * Settings · 技能 — list/toggle/refresh only (no fullscreen root, no Esc).
 * Spec v1.1 §2.4
 */
export default function SkillsList({ onNeedVault }: Props) {
  const vaultPath = useWorkspace((s) => s.vaultPath);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  const goBindVault = () => {
    if (onNeedVault) {
      onNeedVault();
      return;
    }
    window.dispatchEvent(
      new CustomEvent("soit:open-settings", {
        detail: { section: "space" },
      }),
    );
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
      <p className="skills-panel-hint">
        SKILL.md 文件即配置 · 启停写入本库 · 无全局
      </p>

      {!vaultPath ? (
        <div className="skills-panel-empty">
          <p>请先绑定本库后再管理技能</p>
          <button type="button" className="map-btn primary" onClick={goBindVault}>
            绑定本库
          </button>
        </div>
      ) : loading && skills.length === 0 ? (
        <p className="skills-panel-empty">加载中…</p>
      ) : skills.length === 0 ? (
        <p className="skills-panel-empty">本库暂无技能</p>
      ) : (
        <ul className="skills-list">
          {skills.map((s) => (
            <li key={s.id} className="skills-row">
              <div className="skills-meta">
                <span className="skills-name">{s.name || s.id}</span>
                {s.description && (
                  <span className="skills-desc">{s.description}</span>
                )}
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

      {error && (
        <p className="skills-panel-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
