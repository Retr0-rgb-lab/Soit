import { useCallback, useRef } from "react";
import { MAX_MATERIAL_IMPORT_BYTES } from "../../lib/host";
import { useWorkspace } from "../../state/workspaceStore";
import type { MaterialsEntry } from "../../types";
import "./MaterialsRail.css";

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function kindLabel(kind: MaterialsEntry["kind"]): string {
  if (kind === "md") return "MD";
  if (kind === "pdf") return "PDF";
  if (kind === "text") return "TXT";
  if (kind === "dir") return "DIR";
  return String(kind).slice(0, 4).toUpperCase();
}

/**
 * Materials list body for the shared companion pane.
 * `embedded` — fill split right slot (default). Not a separate dock column.
 */
export default function MaterialsList({
  embedded = true,
}: {
  embedded?: boolean;
}) {
  const listStatus = useWorkspace((s) => s.materialsRail.listStatus);
  const entries = useWorkspace((s) => s.materialsRail.entries);
  const error = useWorkspace((s) => s.materialsRail.error);
  const selectedPathRel = useWorkspace((s) => s.materialsRail.selectedPathRel);
  const importBusy = useWorkspace((s) => s.materialsRail.importBusy);
  const vaultPath = useWorkspace((s) => s.vaultPath);
  const closeMaterialsRail = useWorkspace((s) => s.closeMaterialsRail);
  const setCompanionSection = useWorkspace((s) => s.setCompanionSection);
  const refreshMaterials = useWorkspace((s) => s.refreshMaterials);
  const selectMaterial = useWorkspace((s) => s.selectMaterial);
  const importMaterials = useWorkspace((s) => s.importMaterials);
  const leave = useWorkspace((s) => s.leave);
  const spaceBusy = useWorkspace((s) => s.spaceBusy);
  const shellPhase = useWorkspace((s) => s.shellPhase);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const unbound = !vaultPath;
  const leaveBusy =
    spaceBusy || shellPhase === "entering" || shellPhase === "leaving";

  const onImportClick = useCallback(() => {
    if (importBusy || unbound) return;
    fileInputRef.current?.click();
  }, [importBusy, unbound]);

  const onFilesPicked = useCallback(
    async (list: FileList | null) => {
      if (!list?.length || importBusy) return;
      const files: Array<{
        fileName: string;
        bytesBase64: string;
        size: number;
      }> = [];
      for (const file of Array.from(list)) {
        if (file.size > MAX_MATERIAL_IMPORT_BYTES) continue;
        try {
          const buf = await file.arrayBuffer();
          files.push({
            fileName: file.name,
            bytesBase64: arrayBufferToBase64(buf),
            size: file.size,
          });
        } catch {
          /* skip */
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (files.length) await importMaterials(files);
    },
    [importBusy, importMaterials],
  );

  return (
    <aside
      className={`materials-pane${embedded ? " is-embedded" : ""}`}
      aria-label="资料"
    >
      <header className="materials-pane__head">
        <nav className="companion-tabs" aria-label="右侧栏模块">
          <button
            type="button"
            className="companion-tabs__btn is-on"
            aria-current="page"
          >
            资料
          </button>
          <button
            type="button"
            className="companion-tabs__btn"
            onClick={() => setCompanionSection("stars")}
          >
            收藏
          </button>
        </nav>
        <div className="materials-pane__actions">
          <button
            type="button"
            className="materials-pane__btn"
            onClick={() => void refreshMaterials()}
            disabled={importBusy || unbound || listStatus === "loading"}
            title="刷新列表"
          >
            刷新
          </button>
          <button
            type="button"
            className="materials-pane__btn"
            onClick={onImportClick}
            disabled={importBusy || unbound}
            title="导入到 materials/（≤2MB）"
          >
            {importBusy ? "导入中…" : "导入"}
          </button>
          <button
            type="button"
            className="materials-pane__btn materials-pane__btn--close"
            onClick={closeMaterialsRail}
            aria-label="关闭资料"
            title="关闭"
          >
            ×
          </button>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        className="materials-pane__file"
        multiple
        onChange={(e) => void onFilesPicked(e.target.files)}
        tabIndex={-1}
        aria-hidden
      />

      <div className="materials-pane__body">
        {unbound ? (
          <div className="materials-pane__empty">
            <p>尚未进入工作区。</p>
            <p className="materials-pane__hint">
              请先退出到门厅，选择本机 Obsidian 库后再浏览 materials/。
            </p>
            <button
              type="button"
              className="materials-pane__btn is-primary"
              disabled={leaveBusy}
              onClick={() => void leave()}
            >
              {shellPhase === "leaving" ? "退出中…" : "退出工作区"}
            </button>
          </div>
        ) : listStatus === "loading" && entries.length === 0 ? (
          <p className="materials-pane__status">加载中…</p>
        ) : listStatus === "error" ? (
          <div className="materials-pane__empty">
            <p className="materials-pane__error">{error ?? "列表失败"}</p>
            <button
              type="button"
              className="materials-pane__btn"
              onClick={() => void refreshMaterials()}
              disabled={importBusy}
            >
              重试
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="materials-pane__empty">
            <p>materials/ 还没有文件</p>
            <p className="materials-pane__hint">
              可导入 ≤2MB 文件，或直接放入 vault 的 materials/ 后刷新。
            </p>
          </div>
        ) : (
          <ul
            className="materials-pane__list"
            role="listbox"
            aria-label="资料列表"
          >
            {entries.map((entry) => {
              const selected = entry.pathRel === selectedPathRel;
              const isDir = entry.kind === "dir";
              return (
                <li key={entry.pathRel}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`materials-pane__item${selected ? " is-selected" : ""}${isDir ? " is-dir" : ""}`}
                    title={entry.pathRel}
                    disabled={importBusy || isDir}
                    onClick={() => {
                      if (!isDir) void selectMaterial(entry.pathRel);
                    }}
                  >
                    <span className="materials-pane__kind" aria-hidden>
                      {kindLabel(entry.kind)}
                    </span>
                    <span className="materials-pane__name">{entry.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
