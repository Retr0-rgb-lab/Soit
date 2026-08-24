import { useMemo } from "react";
import type { Turn } from "../../types";
import LineSidebar from "./LineSidebar";

export type TurnHistoryItem = Pick<Turn, "id" | "title" | "collapsed">;

type Props = {
  turns: TurnHistoryItem[];
  /** Turn currently focused in the rail (expanded / jumped-to). */
  activeTurnId: string | null;
  onSelect: (turnId: string) => void;
  /** Whether the external dock is open (parent controls hover). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Turn history rail (PEL-148).
 * In-flow on the card’s right: expands beside the card and shrinks card width
 * so the panel stays on-screen. React Bits Line Sidebar for labels + wheel.
 */
export default function TurnHistoryRail({
  turns,
  activeTurnId,
  onSelect,
  open,
  onOpenChange,
}: Props) {
  const labels = useMemo(
    () => turns.map((t) => t.title || "未命名轮次"),
    [turns],
  );

  const activeIndex = useMemo(() => {
    if (!activeTurnId) return null;
    const i = turns.findIndex((t) => t.id === activeTurnId);
    return i >= 0 ? i : null;
  }, [activeTurnId, turns]);

  if (turns.length === 0) return null;

  return (
    <div
      className={`ic-history-dock${open ? " is-open" : ""}`}
      onMouseEnter={() => onOpenChange(true)}
      onMouseLeave={() => onOpenChange(false)}
    >
      {/* Always-present hit strip flush with card right border */}
      <div
        className="ic-history-hit"
        aria-hidden="true"
        title="历史轮次"
      />
      <div
        className="ic-history-panel"
        role="region"
        aria-label="本卡历史轮次"
        aria-hidden={!open}
      >
        <LineSidebar
          items={labels}
          activeIndex={activeIndex}
          showIndex
          showMarker
          scaleTick
          accentColor="var(--accent)"
          textColor="var(--ink-faint)"
          markerColor="var(--line-strong)"
          fontSize={0.8125}
          itemGap={14}
          markerLength={36}
          maxShift={14}
          proximityRadius={80}
          ariaLabel="本卡历史轮次"
          onItemClick={(index) => {
            const t = turns[index];
            if (t) onSelect(t.id);
          }}
        />
      </div>
    </div>
  );
}
