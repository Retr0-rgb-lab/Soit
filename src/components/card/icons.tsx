import type { SVGProps, ComponentType } from "react";
import Command from "reicon-react/icons/Command";
import Hierarchy2 from "reicon-react/icons/Hierarchy2";
import Maximize from "reicon-react/icons/Maximize";
import Minimize from "reicon-react/icons/Minimize";
import More from "reicon-react/icons/More";
import SearchZoomIn from "reicon-react/icons/SearchZoomIn";
import BranchUp from "reicon-react/icons/BranchUp";
import Send from "reicon-react/icons/Send";
import AngleDown from "reicon-react/icons/AngleDown";
import AngleRight from "reicon-react/icons/AngleRight";
import Cpu from "reicon-react/icons/Cpu";

type IconProps = SVGProps<SVGSVGElement>;

/** Shared size for header / edge rounds (36px buttons). */
const TOOL = 18;

type ReiconProps = {
  size?: number | string;
  color?: string;
  weight?: "Outline" | "Filled";
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
};

function reicon(
  Comp: ComponentType<ReiconProps>,
  props: IconProps = {},
) {
  const { className, ...rest } = props;
  return (
    <Comp
      size={TOOL}
      weight="Outline"
      color="currentColor"
      className={className}
      aria-hidden
      {...(rest as object)}
    />
  );
}

/** Ctrl+K jump / command palette */
export function IconJump(p: IconProps = {}) {
  return reicon(Command, p);
}

/** Open inquiry graph / map */
export function IconMap(p: IconProps = {}) {
  return reicon(Hierarchy2, p);
}

/** Enter 专注模式 */
export function IconFocus(p: IconProps = {}) {
  return reicon(Maximize, p);
}

/** Exit 专注模式 */
export function IconFocusExit(p: IconProps = {}) {
  return reicon(Minimize, p);
}

/** Hover tray trigger */
export function IconMore(p: IconProps = {}) {
  return reicon(More, p);
}

/** Turn expand (collapsed → open) */
export function IconTurnExpand(p: IconProps = {}) {
  return reicon(AngleRight, p);
}

/** Turn collapse (open → collapsed) */
export function IconTurnCollapse(p: IconProps = {}) {
  return reicon(AngleDown, p);
}

function base(props: IconProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    ...props,
  };
}

/** 深挖 — Reicon SearchZoomIn */
export function IconDeepen(p: IconProps = {}) {
  return reicon(SearchZoomIn, p);
}

/** 发散 — Reicon BranchUp */
export function IconDiverge(p: IconProps = {}) {
  return reicon(BranchUp, p);
}

export function IconBookmark({
  filled = false,
  ...p
}: IconProps & { filled?: boolean }) {
  if (filled) {
    return (
      <svg {...base(p)} fill="currentColor" stroke="none">
        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    );
  }
  return (
    <svg {...base(p)}>
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function IconTrash(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

export function IconRefresh(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

export function IconCopy(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function IconQuote(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 10h.01M12 10h.01" />
    </svg>
  );
}

export function IconPreview(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
      <path d="M11 8v6M8 11h6" />
    </svg>
  );
}

/** Short explain (selection bar / float affordance). */
export function IconExplain(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
    </svg>
  );
}

/** Composer web search toggle */
export function IconSearch(p: IconProps = {}) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

export function IconSend(p: IconProps = {}) {
  return reicon(Send, p);
}

export function IconChev(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconX(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** Composer attach file */
export function IconAttach(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

/** Open vault doc companion (PEL-156) */
export function IconDoc(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h6" />
    </svg>
  );
}

/** Composer @ mention card */
export function IconAt(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
    </svg>
  );
}

/** Composer model picker */
export function IconModel(p: IconProps = {}) {
  return reicon(Cpu, p);
}
