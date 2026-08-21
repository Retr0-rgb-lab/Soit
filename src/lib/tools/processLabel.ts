/** Entry label for process timeline strip. */

import type { ProcessStep } from "../../types";

export function processEntryLabel(
  process: ProcessStep[] | undefined,
  opts: { open: boolean; busy?: boolean },
): string {
  const steps = process ?? [];
  if (opts.busy) {
    const running = [...steps].reverse().find((s) => s.status === "running");
    if (running?.title) {
      return opts.open ? `${running.title} · 收起` : `${running.title}…`;
    }
    return opts.open ? "进行中 · 收起" : "进行中…";
  }
  if (!steps.length) {
    return opts.open ? "隐藏思考" : "思考过程";
  }
  const hasError = steps.some((s) => s.status === "error");
  const onlyThink = steps.every((s) => s.kind === "think");
  if (onlyThink) {
    return opts.open ? "隐藏思考" : "思考过程";
  }
  if (hasError) {
    return opts.open ? "收起过程" : "过程 · 有失败";
  }
  const n = steps.length;
  return opts.open ? "收起过程" : `过程 · ${n} 步`;
}

export function isProcessBusy(process?: ProcessStep[], think?: string): boolean {
  if (process?.some((s) => s.status === "running")) return true;
  const t = (think ?? "").trim();
  return t === "生成中…" || t.endsWith("中…") || t.endsWith("中...");
}
