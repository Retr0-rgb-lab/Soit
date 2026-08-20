import { useMemo, useState } from "react";
import {
  collapseCrumbs,
  ELLIPSIS_CRUMB_ID,
} from "../../lib/treeNav";
import type { InquiryNode } from "../../types";
import { IconDeepen } from "./icons";

interface Crumb {
  id: string;
  title: string;
}

interface Props {
  crumbs: Crumb[];
  title: string;
  /** Inquiry status — read-only chip when present. */
  status?: string | null;
  /** Guiding question — read-only under title when present. */
  question?: string | null;
  onDeepen: () => void;
  onCrumb: (id: string) => void;
  /** Source chip: return to parent and highlight source span. */
  onReturnToSource?: () => void;
  onOpenMap?: () => void;
  onOpenPalette?: () => void;
  parent?: InquiryNode | null;
  /** Bound vault path present — enables Obsidian write actions */
  vaultBound?: boolean;
  onPrecipitateConcept?: () => void | Promise<void>;
  onAppendResidue?: () => void | Promise<void>;
}

export default function CardHeader({
  crumbs,
  title,
  status,
  question,
  onDeepen,
  onCrumb,
  onReturnToSource,
  onOpenMap,
  onOpenPalette,
  parent,
  vaultBound = false,
  onPrecipitateConcept,
  onAppendResidue,
}: Props) {
  const [crumbsExpanded, setCrumbsExpanded] = useState(false);
  const [busy, setBusy] = useState<"concept" | "residue" | null>(null);

  const visible = useMemo(() => {
    if (crumbsExpanded) return crumbs;
    return collapseCrumbs(crumbs);
  }, [crumbs, crumbsExpanded]);

  const vaultTip = "需要先绑定 Obsidian vault";

  const runConcept = async () => {
    if (!vaultBound || !onPrecipitateConcept || busy) return;
    setBusy("concept");
    try {
      await onPrecipitateConcept();
    } finally {
      setBusy(null);
    }
  };

  const runResidue = async () => {
    if (!vaultBound || !onAppendResidue || busy) return;
    setBusy("residue");
    try {
      await onAppendResidue();
    } finally {
      setBusy(null);
    }
  };

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
        {(status || question) && (
          <div className="ic-meta">
            {status ? (
              <span className="ic-status" data-status={status}>
                {status}
              </span>
            ) : null}
            {question ? <p className="ic-question">{question}</p> : null}
          </div>
        )}
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
          className="ic-precip-btn"
          data-tip={
            vaultBound
              ? "写入概念页到 vault/concepts/"
              : vaultTip
          }
          aria-label="写入概念"
          title={vaultBound ? "写入概念" : vaultTip}
          disabled={!vaultBound || busy !== null}
          onClick={() => void runConcept()}
        >
          {busy === "concept" ? "写入中…" : "写入概念"}
        </button>
        <button
          type="button"
          className="ic-precip-btn"
          data-tip={
            vaultBound
              ? "追加残渣到 vault/inquiry/"
              : vaultTip
          }
          aria-label="记下残渣"
          title={vaultBound ? "记下残渣" : vaultTip}
          disabled={!vaultBound || busy !== null}
          onClick={() => void runResidue()}
        >
          {busy === "residue" ? "记录中…" : "记下残渣"}
        </button>

      </div>
    </div>
  );
}
