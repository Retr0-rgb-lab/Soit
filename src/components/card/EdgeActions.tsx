import { IconDeepen, IconDiverge } from "./icons";

interface Props {
  onDeepen: () => void;
  onDiverge: () => void;
}

export default function EdgeActions({ onDeepen, onDiverge }: Props) {
  return (
    <div className="ic-edge">
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
    </div>
  );
}
