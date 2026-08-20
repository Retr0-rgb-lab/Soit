import {
  useId,
  useState,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { IconMore } from "./icons";

export type HoverIconTrayProps = {
  /** Accessible name for the tool cluster */
  label?: string;
  children: ReactNode;
  className?: string;
};

/**
 * React Bits Dock–inspired tray (CSS slide, no motion lib).
 * Collapsed: ⋯ trigger. Hover / focus-within / click → icons expand.
 * Host (`.ic-card-tools-bl`) is bottom-left; hidden until card hover.
 */
export default function HoverIconTray({
  label = "卡片工具",
  children,
  className = "",
}: HoverIconTrayProps) {
  const [pinned, setPinned] = useState(false);
  const trayId = useId();

  const onTriggerKey = (e: ReactKeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setPinned((v) => !v);
    } else if (e.key === "Escape" && pinned) {
      e.preventDefault();
      setPinned(false);
    }
  };

  return (
    <div
      className={`ic-icon-tray${pinned ? " is-open" : ""}${className ? ` ${className}` : ""}`}
      onMouseLeave={() => setPinned(false)}
    >
      <div
        id={trayId}
        className="ic-icon-tray-rail"
        role="toolbar"
        aria-label={label}
      >
        {children}
      </div>
      <button
        type="button"
        className="ic-round ic-icon-tray-trigger"
        aria-label={label}
        aria-expanded={pinned}
        aria-controls={trayId}
        data-tip={label}
        onClick={() => setPinned((v) => !v)}
        onKeyDown={onTriggerKey}
      >
        <IconMore />
      </button>
    </div>
  );
}
