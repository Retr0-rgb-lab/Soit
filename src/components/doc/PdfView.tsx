import { useEffect, useState } from "react";
import type { DocRef } from "../../lib/docSession";
import { getPdfPreviewUrl } from "../../lib/host";
import PdfGuide from "./PdfGuide";

type Props = {
  docRef: DocRef;
};

type Phase = "loading" | "ready" | "error";

/**
 * PDF embed (PEL-156 P1): iframe into the loopback preview server,
 * rendered by the WebView2 built-in PDF viewer. Falls back to PdfGuide
 * when the host cannot serve (browser mock / server start failure).
 */
export default function PdfView({ docRef }: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setPhase("loading");
    setUrl(null);
    void getPdfPreviewUrl(docRef.pathRel)
      .then((r) => {
        if (!alive) return;
        if (r.ok && r.url) {
          setUrl(r.url);
          setPhase("ready");
        } else {
          setPhase("error");
        }
      })
      .catch(() => {
        if (alive) setPhase("error");
      });
    return () => {
      alive = false;
    };
  }, [docRef.pathRel]);

  if (phase === "loading") {
    return (
      <div className="doc-pane__status" role="status">
        <p className="doc-pane__status-text">正在准备 PDF 预览…</p>
      </div>
    );
  }
  if (phase === "error" || !url) {
    return <PdfGuide docRef={docRef} />;
  }
  return (
    <iframe
      className="pdf-embed"
      src={url}
      title={docRef.displayName}
      referrerPolicy="no-referrer"
    />
  );
}
