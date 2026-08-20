import {
  completeResultToHtml,
  resolvePort,
  type ChatMessage,
} from "../lib/chat";
import { mergeHostSnapshot } from "./spawnMerge";
import {
  isUniverseSource,
  patchTurnAi,
  type StoreGet,
  type StoreSet,
  withSkillsSystem,
} from "./turnHelpers";

function escapeErr(msg: string): string {
  return msg.replace(/</g, "&lt;");
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: string }).name;
  return name === "AbortError";
}

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

/**
 * Shared Inquiry complete pipeline (Spec §2.1).
 * Callers register inquiryInflight before await; clear matching gen in finally.
 */
export async function runCompletion(args: {
  get: StoreGet;
  set: StoreSet;
  cardId: string;
  turnId: string;
  messages: ChatMessage[];
  scope: unknown;
  gen: string;
  signal: AbortSignal;
  /** Prefix for user-visible error copy (发送 vs 重生). */
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

  const writeAi = async (aiHtml: string, think: string) => {
    if (!stillCurrent(get, cardId, turnId, gen)) return;
    if (isUniverseSource(get().source)) {
      try {
        const { updateTurn } = await import("../lib/host");
        const res = await updateTurn({
          cardId,
          turnId,
          aiHtml,
          think,
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
        });
        return;
      }
    }
    if (!stillCurrent(get, cardId, turnId, gen)) return;
    patchTurnAi(set, cardId, turnId, { aiHtml, think });
  };

  try {
    if (signal.aborted || !stillCurrent(get, cardId, turnId, gen)) return;

    const withSkills = await withSkillsSystem(messages);
    if (signal.aborted || !stillCurrent(get, cardId, turnId, gen)) return;

    const port = await resolvePort();
    if (signal.aborted || !stillCurrent(get, cardId, turnId, gen)) return;

    const result = await port.complete({
      cardId,
      messages: withSkills,
      scope,
      signal,
    });

    if (signal.aborted || !stillCurrent(get, cardId, turnId, gen)) return;

    let text = result.text;
    if (!text.trim()) {
      text = "（模型返回为空）";
    }
    const aiHtml = completeResultToHtml({ ...result, text });
    const think = result.marks?.length
      ? `marks: ${result.marks.map((m) => m.term).join(", ")}`
      : "";

    await writeAi(aiHtml, think);
  } catch (err) {
    if (isAbortError(err) || signal.aborted) return;
    if (!stillCurrent(get, cardId, turnId, gen)) return;
    const msg = err instanceof Error ? err.message : String(err);
    const aiHtml = `<p><em>${escapeErr(errorLabel)}失败：${escapeErr(msg)}</em></p>`;
    await writeAi(aiHtml, "");
  }
}
