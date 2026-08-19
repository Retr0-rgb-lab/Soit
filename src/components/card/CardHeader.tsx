import { useState } from "react";
import { IconBookmark, IconDeepen, IconTrash } from "./icons";

interface Props {
  path: string;
  title: string;
  onDeepen: () => void;
}

export default function CardHeader({ path, title, onDeepen }: Props) {
  const [bookOn, setBookOn] = useState(false);

  return (
    <div className="ic-head">
      <div className="titles">
        <p className="ic-kicker" title={path}>
          {path}
        </p>
        <h1>{title}</h1>
      </div>
      <div className="ic-head-tools">
        <button
          type="button"
          className="ic-round"
          data-tip="从此卡片深挖"
          aria-label="从此卡片深挖"
          onClick={onDeepen}
        >
          <IconDeepen />
        </button>
        <button
          type="button"
          className="ic-round"
          data-tip={bookOn ? "取消沉淀标记" : "沉淀 / 收藏卡片"}
          aria-label={bookOn ? "取消沉淀标记" : "沉淀 / 收藏卡片"}
          onClick={() => setBookOn((v) => !v)}
        >
          <IconBookmark />
        </button>
        <button
          type="button"
          className="ic-round danger"
          data-tip="删除卡片（demo 不删）"
          aria-label="删除卡片（demo 不删）"
          onClick={() => {
            /* noop — demo tip only */
          }}
        >
          <IconTrash />
        </button>
      </div>
    </div>
  );
}
