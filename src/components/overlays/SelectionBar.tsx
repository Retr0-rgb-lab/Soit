import { IconCopy, IconPreview, IconQuote } from "../card/icons";

export interface SelectionBarState {
  text: string;
  x: number;
  y: number;
}

interface Props {
  bar: SelectionBarState;
  onPreview: () => void;
  onQuote: () => void;
  onCopy: () => void;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function SelectionBar({ bar, onPreview, onQuote, onCopy }: Props) {
  // Center bar on selection midpoint (bar.x is already mid-x of the range).
  const left = clamp(bar.x, 48, window.innerWidth - 48);
  const top = clamp(bar.y, 8, window.innerHeight - 120);

  return (
    <div
      className="ic-selbar"
      style={{ left, top, transform: "translateX(-50%)" }}
      role="toolbar"
      aria-label="选区操作"
    >
      <button
        type="button"
        className="ic-round"
        data-tip="从选中文本预览 / 选方向"
        aria-label="预览"
        onClick={onPreview}
      >
        <IconPreview />
      </button>
      <button
        type="button"
        className="ic-round"
        data-tip="引用选中文本"
        aria-label="引用"
        onClick={onQuote}
      >
        <IconQuote />
      </button>
      <button
        type="button"
        className="ic-round"
        data-tip="复制"
        aria-label="复制"
        onClick={onCopy}
      >
        <IconCopy />
      </button>
    </div>
  );
}
