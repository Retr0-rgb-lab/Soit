import {
  IconDeepen,
  IconDiverge,
  IconX,
} from "../card/icons";

export type TermFloatStatus = "loading" | "ready" | "error";

export interface TermFloatState {
  /** Display title (mark = term; selection may truncate). */
  term: string;
  /** Full text for explain / spawn SourceSpan / quote — not truncated title. */
  span: string;
  body: string;
  status: TermFloatStatus;
  error?: string;
  x: number;
  y: number;
  source: "mark" | "selection";
  turnId?: string;
  markId?: string;
}

interface Props {
  float: TermFloatState;
  onClose: () => void;
  onRetry: () => void;
  /** Parent already holds float.span for SourceSpan.text. */
  onDeepen: () => void;
  onDiverge: () => void;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function TermFloat({
  float,
  onClose,
  onRetry,
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
            onClick={onDeepen}
          >
            <IconDeepen />
          </button>
          <button
            type="button"
            className="ic-round"
            data-tip="发散"
            aria-label="发散"
            onClick={onDiverge}
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
        {float.status === "loading" ? (
          <p className="ic-float-status" role="status" aria-live="polite">
            <span className="ic-float-spinner" aria-hidden />
            解释中…
          </p>
        ) : null}
        {float.status === "error" ? (
          <div className="ic-float-error" role="alert">
            <p>{float.error || "解释失败"}</p>
            <button type="button" className="ic-float-retry" onClick={onRetry}>
              重试
            </button>
          </div>
        ) : null}
        {float.status === "ready" ? <p className="ic-float-explain">{float.body}</p> : null}
        <p className="ic-muted">短解释不建卡；要继续探究再选深挖 / 发散。</p>
      </div>
    </div>
  );
}
