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

/** Right dock: vault materials/ list + import (materials-rail SPE §2.4). */
export default function MaterialsRail() {
  const open = useWorkspace((s) => s.materialsRail.open);
  const listStatus = useWorkspace((s) => s.materialsRail.listStatus);
  const entries = useWorkspace((s) => s.materialsRail.entries);
  const error = useWorkspace((s) => s.materialsRail.error);
  const selectedPathRel = useWorkspace((s) => s.materialsRail.selectedPathRel);
  const importBusy = useWorkspace((s) => s.materialsRail.importBusy);
  const vaultPath = useWorkspace((s) => s.vaultPath);
  const source = useWorkspace((s) => s.source);
  const closeMaterialsRail = useWorkspace((s) => s.closeMaterialsRail);
  const refreshMaterials = useWorkspace((s) => s.refreshMaterials);
  const selectMaterial = useWorkspace((s) => s.selectMaterial);
  const importMaterials = useWorkspace((s) => s.importMaterials);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const unbound = !vaultPath && source !== "demo";

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
        if (file.size > MAX_MATERIAL_IMPORT_BYTES) {
          // Oversize: skip; user can drop into materials/ and refresh (SPE §2.5).
          continue;
        }
        try {
          const buf = await file.arrayBuffer();
          files.push({
            fileName: file.name,
            bytesBase64: arrayBufferToBase64(buf),
            size: file.size,
          });
        } catch {
          // Skip unreadable files; continue batch.
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (files.length) await importMaterials(files);
    },
    [importBusy, importMaterials],
  );

  if (!open) return null;

  return (
    <aside className="materials-rail" aria-label="资料">
      <header className="materials-rail__head">
        <h2 className="materials-rail__title">资料</h2>
        <div className="materials-rail__actions">
          <button
            type="button"
            className="materials-rail__btn"
            onClick={() => void refreshMaterials()}
            disabled={importBusy || unbound || listStatus === "loading"}
            title="刷新列表"
          >
            刷新
          </button>
          <button
            type="button"
            className="materials-rail__btn"
            onClick={onImportClick}
            disabled={importBusy || unbound}
            title="导入到 materials/（≤2MB）"
          >
            {importBusy ? "导入中…" : "导入"}
          </button>
          <button
            type="button"
            className="materials-rail__btn materials-rail__btn--close"
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
        className="materials-rail__file"
        multiple
        onChange={(e) => void onFilesPicked(e.target.files)}
        tabIndex={-1}
        aria-hidden
      />

      <div className="materials-rail__body">
        {unbound ? (
          <div className="materials-rail__empty">
            <p>尚未绑定 Obsidian vault。</p>
            <p className="materials-rail__hint">
              请先在设置 · 空间绑定本机路径，再浏览 materials/。
            </p>
            <button
              type="button"
              className="materials-rail__btn is-primary"
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
        ) : listStatus === "loading" && entries.length === 0 ? (
          <p className="materials-rail__status">加载中…</p>
        ) : listStatus === "error" ? (
          <div className="materials-rail__empty">
            <p className="materials-rail__error">{error ?? "列表失败"}</p>
            <button
              type="button"
              className="materials-rail__btn"
              onClick={() => void refreshMaterials()}
              disabled={importBusy}
            >
              重试
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="materials-rail__empty">
            <p>materials/ 还没有文件</p>
            <p className="materials-rail__hint">
              可导入 ≤2MB 文件，或直接放入 vault 的 materials/ 后刷新。
            </p>
          </div>
        ) : (
          <ul className="materials-rail__list" role="listbox" aria-label="资料列表">
            {entries.map((entry) => {
              const selected = entry.pathRel === selectedPathRel;
              const isDir = entry.kind === "dir";
              return (
                <li key={entry.pathRel}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`materials-rail__item${selected ? " is-selected" : ""}${isDir ? " is-dir" : ""}`}
                    title={entry.pathRel}
                    disabled={importBusy || isDir}
                    onClick={() => {
                      if (!isDir) void selectMaterial(entry.pathRel);
                    }}
                  >
                    <span className="materials-rail__kind" aria-hidden>
                      {kindLabel(entry.kind)}
                    </span>
                    <span className="materials-rail__name">{entry.name}</span>
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
