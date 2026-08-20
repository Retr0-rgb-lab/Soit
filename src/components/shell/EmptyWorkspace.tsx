import { useState } from "react";
import { createRootInquiry } from "../../lib/host";
import { useWorkspace } from "../../state/workspaceStore";

/** Empty vault / no cards — never inject demo (Spec A load matrix). */
export default function EmptyWorkspace() {
  const source = useWorkspace((s) => s.source);
  const vaultPath = useWorkspace((s) => s.vaultPath);
  const loadSnapshot = useWorkspace((s) => s.loadSnapshot);
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCreate = async () => {
    const t = title.trim() || "未命名探究";
    setBusy(true);
    setError(null);
    try {
      const snap = await createRootInquiry(
        t,
        question.trim() || undefined,
      );
      loadSnapshot(snap);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const vaultLabel = vaultPath
    ? vaultPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ??
      vaultPath
    : null;

  return (
    <div className="empty-workspace" aria-label="empty universe">
      <p className="shell-label">本库</p>
      <h1 className="empty-title">
        {source === "empty" ? "本库还没有探究" : "尚未打开工作区"}
      </h1>
      <p className="shell-placeholder">
        {vaultLabel
          ? `已绑定「${vaultLabel}」。卡片只活在本库 .soit/universe.db，不会为每张卡写一篇笔记。`
          : "先绑定 Obsidian vault，再新建根探究。可从设置 · 空间打开本机路径。"}
      </p>
      {!vaultPath && (
        <div className="empty-form">
          <button
            type="button"
            className="empty-submit"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("soit:open-settings", {
                  detail: { section: "space" },
                }),
              );
            }}
          >
            打开设置 · 空间
          </button>
        </div>
      )}
      {vaultPath && (
        <form
          className="empty-form"
          onSubmit={(e) => {
            e.preventDefault();
            void onCreate();
          }}
        >
          <label className="empty-field">
            <span>根探究标题</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：线性代数基础"
              autoFocus
              disabled={busy}
            />
          </label>
          <label className="empty-field">
            <span>起始问题（可选）</span>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="你真正想弄清的一句话"
              disabled={busy}
            />
          </label>
          {error && <p className="empty-error">{error}</p>}
          <button type="submit" className="empty-submit" disabled={busy}>
            {busy ? "创建中…" : "新建根探究"}
          </button>
        </form>
      )}
    </div>
  );
}
