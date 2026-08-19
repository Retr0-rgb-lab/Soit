import { useCallback, useEffect, useState } from "react";
import { listSkills, setSkillEnabled } from "../../lib/host";
import type { SkillInfo } from "../../types";
import { useWorkspace } from "../../state/workspaceStore";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function SkillsPanel({ open, onClose }: Props) {
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
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

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

  if (!open) return null;

  return (
    <div
      className="skills-panel-root"
      role="dialog"
      aria-modal="true"
      aria-label="技能"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="skills-panel">
        <div className="skills-panel-head">
          <div>
            <p className="shell-label">设置</p>
            <h2 className="skills-panel-title">技能</h2>
          </div>
          <button
            type="button"
            className="skills-panel-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <p className="skills-panel-hint">
          SKILL.md 文件即配置 · 启停写入本库 · 无市场
        </p>

        {!vaultPath ? (
          <p className="skills-panel-empty">请先绑定本库后再管理技能</p>
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
      </div>
    </div>
  );
}
