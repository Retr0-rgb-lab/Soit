import { useMemo, useState } from "react";
import {
  collapseCrumbs,
  ELLIPSIS_CRUMB_ID,
} from "../../lib/treeNav";
import type { InquiryNode } from "../../types";
import { IconBookmark, IconDeepen, IconTrash } from "./icons";

interface Crumb {
  id: string;
  title: string;
}

interface Props {
  crumbs: Crumb[];
  title: string;
  onDeepen: () => void;
  onCrumb: (id: string) => void;
  /** Source chip: return to parent and highlight source span. */
  onReturnToSource?: () => void;
  onOpenMap?: () => void;
  onOpenPalette?: () => void;
  parent?: InquiryNode | null;
}

export default function CardHeader({
  crumbs,
  title,
  onDeepen,
  onCrumb,
  onReturnToSource,
  onOpenMap,
  onOpenPalette,
  parent,
}: Props) {
  const [bookOn, setBookOn] = useState(false);
  const [crumbsExpanded, setCrumbsExpanded] = useState(false);

  const visible = useMemo(() => {
    if (crumbsExpanded) return crumbs;
    return collapseCrumbs(crumbs);
  }, [crumbs, crumbsExpanded]);

  return (
    <div className="ic-head">
      <div className="titles">
        <nav className="ic-crumbs" aria-label="探究路径">
          {visible.length === 0 ? (
            <span className="ic-crumb muted">Soit</span>
          ) : (
            visible.map((c, i) => {
              const last = i === visible.length - 1;
              return (
                <span key={`${c.id}-${i}`} className="ic-crumb-wrap">
                  {i > 0 && (
                    <span className="ic-crumb-sep" aria-hidden>
                      /
                    </span>
                  )}
                  {c.id === ELLIPSIS_CRUMB_ID ? (
                    <button
                      type="button"
                      className="ic-crumb link"
                      aria-label="展开完整路径"
                      onClick={() => setCrumbsExpanded(true)}
                    >
                      …
                    </button>
                  ) : last ? (
                    <span className="ic-crumb current" aria-current="page">
                      {c.title}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="ic-crumb link"
                      onClick={() => onCrumb(c.id)}
                    >
                      {c.title}
                    </button>
                  )}
                </span>
              );
            })
          )}
          {crumbsExpanded && crumbs.length > 4 && (
            <button
              type="button"
              className="ic-crumb link"
              style={{ marginLeft: 8 }}
              onClick={() => setCrumbsExpanded(false)}
            >
              收起
            </button>
          )}
        </nav>
        <h1>{title}</h1>
        {parent && (
          <p className="ic-source-chip">
            <span className="ic-source-label">来自</span>
            <button
              type="button"
              className="ic-source-link"
              onClick={() =>
                onReturnToSource ? onReturnToSource() : onCrumb(parent.id)
              }
            >
              {parent.title}
            </button>
          </p>
        )}
      </div>
      <div className="ic-head-tools">
        {onOpenPalette && (
          <button
            type="button"
            className="ic-round"
            data-tip="跳转卡片 Ctrl+K"
            aria-label="跳转卡片"
            onClick={onOpenPalette}
          >
            <span className="ic-tool-glyph" aria-hidden>
              ⌕
            </span>
          </button>
        )}
        {onOpenMap && (
          <button
            type="button"
            className="ic-round"
            data-tip="图谱 Ctrl+\\"
            aria-label="打开图谱"
            onClick={onOpenMap}
          >
            <span className="ic-tool-glyph" aria-hidden>
              ◎
            </span>
          </button>
        )}
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
