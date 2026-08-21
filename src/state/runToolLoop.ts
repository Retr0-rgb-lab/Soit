/**
 * Bounded Host tool loop for Inquiry complete (tools-search spec v1.1).
 * Wire history is ephemeral; process updates mid-loop are FE-only.
 */

import {
  completeResultToHtml,
  messagesToWire,
  resolvePort,
  type ChatCompleteResult,
  type ChatMessage,
  type ChatPort,
  type ChatWireMessage,
} from "../lib/chat";
import {
  getToolsPrefs,
  INQUIRY_TOOL_DEFS,
  toolKindFromName,
  type ToolsPrefs,
} from "../lib/tools";
import type { ProcessStep } from "../types";
import {
  isUniverseSource,
  patchTurnAi,
  type StoreGet,
  type StoreSet,
  withSkillsSystem,
} from "./turnHelpers";
import { mergeHostSnapshot } from "./spawnMerge";

const MAX_CALLS_PER_ROUND = 3;

/** True when this gen still owns inquiryInflight and the turn still exists. */
export function stillCurrent(
  get: StoreGet,
  cardId: string,
  turnId: string,
  gen: string,
): boolean {
  const s = get();
  const inflight = s.inquiryInflight;
  if (!inflight || inflight.gen !== gen) return false;
  if (inflight.cardId !== cardId || inflight.turnId !== turnId) return false;
  const turn = s.turnsByCardId[cardId]?.find((t) => t.id === turnId);
  return Boolean(turn);
}

function newStepId(): string {
  return `ps_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { name?: string }).name === "AbortError";
}

async function invokeTool(
  name: string,
  argsJson: string,
): Promise<{
  ok: boolean;
  title: string;
  summary: string;
  content: string;
  error?: string;
}> {
  try {
    const { invokeInquiryTool } = await import("../lib/host");
    return await invokeInquiryTool(name, argsJson);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      title: name,
      summary: msg,
      content: msg,
      error: msg,
    };
  }
}

export async function runToolAwareCompletion(args: {
  get: StoreGet;
  set: StoreSet;
  cardId: string;
  turnId: string;
  messages: ChatMessage[];
  scope: unknown;
  gen: string;
  signal: AbortSignal;
  errorLabel?: string;
}): Promise<void> {
  const {
    get,
    set,
    cardId,
    turnId,
    messages,
    scope,
    gen,
    signal,
    errorLabel = "回复",
  } = args;

  const escapeErr = (msg: string) => msg.replace(/</g, "&lt;");

  const writeFinal = async (
    aiHtml: string,
    think: string,
    process: ProcessStep[],
  ) => {
    if (!stillCurrent(get, cardId, turnId, gen)) return;
    if (isUniverseSource(get().source)) {
      try {
        const { updateTurn } = await import("../lib/host");
        const res = await updateTurn({
          cardId,
          turnId,
          aiHtml,
          think,
          process,
        });
        if (!stillCurrent(get, cardId, turnId, gen)) return;
        if (res.snapshot) {
          mergeHostSnapshot(get, set, res.snapshot, get().focusId);
          return;
        }
      } catch (err) {
        console.error("[soit] update_turn after complete failed", err);
        if (!stillCurrent(get, cardId, turnId, gen)) return;
        const msg = err instanceof Error ? err.message : String(err);
        patchTurnAi(set, cardId, turnId, {
          aiHtml: `<p><em>${escapeErr(errorLabel)}写入失败：${escapeErr(msg)}</em></p>`,
          think: "",
          process,
        });
        return;
      }
    }
    if (!stillCurrent(get, cardId, turnId, gen)) return;
    patchTurnAi(set, cardId, turnId, { aiHtml, think, process });
  };

  const patchProcess = (process: ProcessStep[], thinkBusy?: string) => {
    if (!stillCurrent(get, cardId, turnId, gen)) return;
    patchTurnAi(set, cardId, turnId, {
      process: process.map((s) => ({ ...s })),
      ...(thinkBusy != null ? { think: thinkBusy } : {}),
    });
  };

  try {
    if (signal.aborted || !stillCurrent(get, cardId, turnId, gen)) return;

    const withSkills = await withSkillsSystem(messages);
    if (signal.aborted || !stillCurrent(get, cardId, turnId, gen)) return;

    const prefs: ToolsPrefs = await getToolsPrefs();
    if (signal.aborted || !stillCurrent(get, cardId, turnId, gen)) return;

    const port: ChatPort = await resolvePort();
    if (signal.aborted || !stillCurrent(get, cardId, turnId, gen)) return;

    const toolsOn = prefs.toolsEnabled;
    const tools = toolsOn ? INQUIRY_TOOL_DEFS : undefined;
    const maxRounds = prefs.maxToolRounds;

    let wire: ChatWireMessage[] = messagesToWire(withSkills);
    const process: ProcessStep[] = [];
    let final: ChatCompleteResult | null = null;

    for (let round = 0; round < maxRounds; round++) {
      if (signal.aborted || !stillCurrent(get, cardId, turnId, gen)) {
        for (const s of process) {
          if (s.status === "running") s.status = "cancelled";
        }
        return;
      }

      const result = await port.complete({
        cardId,
        wireMessages: wire,
        scope,
        signal,
        tools,
        toolChoice: tools ? "auto" : "none",
        toolsEnabled: toolsOn,
      });

      if (signal.aborted || !stillCurrent(get, cardId, turnId, gen)) return;

      if (result.think?.trim()) {
        process.push({
          id: newStepId(),
          kind: "think",
          title: "思考",
          summary: result.think.trim().slice(0, 80),
          status: "ok",
          detail: result.think.trim(),
          endedAt: new Date().toISOString(),
        });
        patchProcess(process, "生成中…");
      }

      const calls = result.toolCalls?.slice(0, MAX_CALLS_PER_ROUND) ?? [];
      if (!calls.length) {
        final = result;
        break;
      }

      wire = [
        ...wire,
        {
          role: "assistant",
          content: result.text?.trim() ? result.text : null,
          tool_calls: calls.map((c) => ({
            id: c.id,
            type: "function" as const,
            function: { name: c.name, arguments: c.arguments || "{}" },
          })),
        },
      ];

      for (const call of calls) {
        if (signal.aborted || !stillCurrent(get, cardId, turnId, gen)) {
          for (const s of process) {
            if (s.status === "running") s.status = "cancelled";
          }
          return;
        }

        let argsObj: unknown = {};
        try {
          argsObj = JSON.parse(call.arguments || "{}");
        } catch {
          argsObj = {};
        }
        const kind = toolKindFromName(call.name);
        const step: ProcessStep = {
          id: newStepId(),
          kind: kind === "think" ? "vault_search" : kind,
          title:
            kind === "vault_search"
              ? "检索库内"
              : kind === "web_search"
                ? "网页搜索"
                : kind === "fetch_url"
                  ? "读取链接"
                  : call.name,
          summary:
            typeof argsObj === "object" &&
            argsObj &&
            "query" in argsObj &&
            typeof (argsObj as { query?: unknown }).query === "string"
              ? String((argsObj as { query: string }).query).slice(0, 80)
              : typeof argsObj === "object" &&
                  argsObj &&
                  "url" in argsObj &&
                  typeof (argsObj as { url?: unknown }).url === "string"
                ? String((argsObj as { url: string }).url).slice(0, 80)
                : call.name,
          status: "running",
          startedAt: new Date().toISOString(),
        };
        process.push(step);
        patchProcess(process, `${step.title}中…`);

        const known = ["vault_search", "web_search", "fetch_url"].includes(
          call.name,
        );
        let inv: Awaited<ReturnType<typeof invokeTool>>;
        if (!known) {
          inv = {
            ok: false,
            title: "未知工具",
            summary: `unknown tool: ${call.name}`,
            content: `unknown tool: ${call.name}`,
            error: `unknown tool: ${call.name}`,
          };
        } else {
          inv = await invokeTool(call.name, call.arguments || "{}");
        }

        step.status = inv.ok ? "ok" : "error";
        step.title = inv.title || step.title;
        step.summary = inv.summary || step.summary;
        step.detail = (inv.content || inv.error || "").slice(0, 4000);
        step.endedAt = new Date().toISOString();
        patchProcess(process, "生成中…");

        wire = [
          ...wire,
          {
            role: "tool",
            tool_call_id: call.id,
            content: inv.content || inv.error || "(empty)",
          },
        ];
      }
    }

    if (!final) {
      // Exhausted rounds — one last hop without tools.
      if (signal.aborted || !stillCurrent(get, cardId, turnId, gen)) return;
      final = await port.complete({
        cardId,
        wireMessages: wire,
        scope,
        signal,
        toolChoice: "none",
        toolsEnabled: toolsOn,
      });
      if (final.think?.trim()) {
        process.push({
          id: newStepId(),
          kind: "think",
          title: "思考",
          summary: final.think.trim().slice(0, 80),
          status: "ok",
          detail: final.think.trim(),
          endedAt: new Date().toISOString(),
        });
      }
    }

    if (signal.aborted || !stillCurrent(get, cardId, turnId, gen)) return;

    let text = final.text ?? "";
    if (!text.trim() && !final.toolCalls?.length) {
      text = "（模型返回为空）";
    }
    const aiHtml = completeResultToHtml({ ...final, text });
    const thinkFromSteps = process
      .filter((s) => s.kind === "think" && s.detail)
      .map((s) => s.detail!)
      .join("\n\n");
    const think =
      thinkFromSteps ||
      (final.think ?? "").trim() ||
      (final.marks?.length
        ? `可分叉术语：${final.marks.map((m) => m.term).join("、")}`
        : "");

    await writeFinal(aiHtml, think, process);
  } catch (err) {
    if (isAbortError(err) || signal.aborted) return;
    if (!stillCurrent(get, cardId, turnId, gen)) return;
    const msg = err instanceof Error ? err.message : String(err);
    const aiHtml = `<p><em>${escapeErr(errorLabel)}失败：${escapeErr(msg)}</em></p>`;
    await writeFinal(aiHtml, "", []);
  }
}
