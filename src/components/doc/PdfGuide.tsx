import { useCallback, useState } from "react";
import { formatBytes } from "../../lib/composerPayload";
import type { DocKind, DocRef } from "../../lib/docSession";

type Props = {
  docRef: DocRef;
};

export default function PdfGuide({ docRef }: Props) {
  const [copied, setCopied] = useState(false);
  const isPdf = docRef.kind === "pdf";
  const kindLabel = kindLabelOf(docRef.kind);

  const onCopy = useCallback(async () => {
    const value = docRef.pathRel;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [docRef.pathRel]);

  return (
    <div className="pdf-guide" role="status">
      <h3 className="pdf-guide__title">
        {isPdf ? "PDF 暂不内嵌预览" : "暂不支持预览此类型"}
      </h3>
      <dl className="pdf-guide__meta">
        <div>
          <dt>路径</dt>
          <dd>{docRef.pathRel}</dd>
        </div>
        <div>
          <dt>类型</dt>
          <dd>{kindLabel}</dd>
        </div>
        {docRef.size != null ? (
          <div>
            <dt>大小</dt>
            <dd>{formatBytes(docRef.size)}</dd>
          </div>
        ) : null}
      </dl>
      <p className="pdf-guide__note">
        {isPdf
          ? "P0 请用系统阅读器或 Obsidian 打开该文件。内嵌 PDF 预览后置；不会把整份 PDF 塞进对话。"
          : "当前仅支持 Markdown / 纯文本陪读。可用系统应用打开原文件。"}
      </p>
      <div className="pdf-guide__actions">
        <button
          type="button"
          className="doc-pane__primary"
          onClick={() => void onCopy()}
        >
          {copied ? "已复制路径" : "复制路径"}
        </button>
      </div>
    </div>
  );
}

function kindLabelOf(kind: DocKind): string {
  switch (kind) {
    case "pdf":
      return "PDF";
    case "md":
      return "Markdown";
    case "text":
      return "文本";
    default:
      return "不支持";
  }
}
