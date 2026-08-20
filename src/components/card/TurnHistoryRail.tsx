import type { Turn } from "../../types";

export type TurnHistoryItem = Pick<Turn, "id" | "title" | "collapsed">;

type Props = {
  turns: TurnHistoryItem[];
  /** Turn currently focused in the rail (expanded / jumped-to). */
  activeTurnId: string | null;
  onSelect: (turnId: string) => void;
};

/**
 * Card-right turn history rail (Explore-style).
 * Collapsed: narrow dots. Hover / focus-within: expands to show titles.
 * PEL-148 — not the workspace graph; per-card multi-turn history only.
 */
export default function TurnHistoryRail({
  turns,
  activeTurnId,
  onSelect,
}: Props) {
  if (turns.length === 0) return null;

  return (
    <nav
      className="ic-turn-rail"
      aria-label="本卡历史轮次"
    >
      <ul className="ic-turn-rail-list">
        {turns.map((t) => {
          const isOn = t.id === activeTurnId;
          const hint = isOn
            ? "当前"
            : t.collapsed
              ? "点击展开"
              : "跳转到此轮";
          return (
            <li key={t.id}>
              <button
                type="button"
                className={`ic-turn-rail-item${isOn ? " on" : ""}${t.collapsed ? " is-collapsed" : ""}`}
                title={t.title}
                aria-current={isOn ? "true" : undefined}
                aria-label={`${t.title}${isOn ? "（当前）" : t.collapsed ? "（已折叠）" : ""}`}
                onClick={() => onSelect(t.id)}
              >
                <span className="ic-turn-rail-hint">{hint}</span>
                <span className="ic-turn-rail-title">{t.title || "未命名轮次"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
