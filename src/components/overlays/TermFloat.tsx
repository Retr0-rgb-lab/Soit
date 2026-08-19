import {
  IconDeepen,
  IconDiverge,
  IconX,
} from "../card/icons";

export interface TermFloatState {
  term: string;
  body: string;
  x: number;
  y: number;
}

interface Props {
  float: TermFloatState;
  onClose: () => void;
  onDeepen: (term: string) => void;
  onDiverge: (term: string) => void;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function TermFloat({
  float,
  onClose,
  onDeepen,
  onDiverge,
}: Props) {
  const left = clamp(float.x, 8, window.innerWidth - 440);
  const top = clamp(float.y, 8, window.innerHeight - 300);

  return (
    <div className="ic-float" style={{ left, top }} role="dialog" aria-label={float.term}>
      <div className="ic-float-head">
        <strong>{float.term}</strong>
        <div className="ic-float-tools">
          <button
            type="button"
            className="ic-round"
            data-tip="深挖"
            aria-label="深挖"
            onClick={() => onDeepen(float.term)}
          >
            <IconDeepen />
          </button>
          <button
            type="button"
            className="ic-round"
            data-tip="发散"
            aria-label="发散"
            onClick={() => onDiverge(float.term)}
          >
            <IconDiverge />
          </button>
          <button
            type="button"
            className="ic-round"
            data-tip="关闭"
            aria-label="关闭"
            onClick={onClose}
          >
            <IconX />
          </button>
        </div>
      </div>
      <div className="ic-float-body">
        <p>{float.body}</p>
        <p className="ic-muted">Soit：浮层可解释；长卡只认深挖 / 发散。重来在轮次条。</p>
      </div>
    </div>
  );
}
