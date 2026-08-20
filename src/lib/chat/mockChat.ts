import type {
  ChatCompleteInput,
  ChatCompleteResult,
  ChatExplainInput,
  ChatMark,
  ChatPort,
} from "./port";

const GLOSSARY: ChatMark[] = [
  {
    term: "函子",
    explanation: "范畴之间的映射：对象→对象，态射→态射，保住复合与单位。",
  },
  {
    term: "范畴",
    explanation: "对象 + 态射 + 复合 + 单位。",
  },
  {
    term: "自然变换",
    explanation: "函子之间的态射。",
  },
];

/** Short abort-pollable delay when signal is present (Spec §2.1). */
const MOCK_ABORT_BUDGET_MS = 80;
const MOCK_ABORT_STEP_MS = 40;

function pickMarks(userText: string, scope: unknown): ChatMark[] {
  const hay = userText + " " + JSON.stringify(scope ?? {});
  const hit = GLOSSARY.filter((m) => hay.includes(m.term));
  if (hit.length > 0) return hit.slice(0, 3);
  // Default structured marks so UI can still fork.
  return [GLOSSARY[0]!, GLOSSARY[1]!];
}

function scopeHint(scope: unknown): string {
  if (!scope || typeof scope !== "object") return "";
  const s = scope as {
    span?: { text?: string };
    why?: string;
    parentStatus?: string;
  };
  const parts: string[] = [];
  if (s.span?.text) parts.push(`源跨度「${s.span.text}」`);
  if (s.why) parts.push(`原因：${s.why}`);
  if (s.parentStatus) parts.push(`父状态 ${s.parentStatus}`);
  return parts.length ? `（深挖范围：${parts.join(" · ")}）` : "";
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

/** Sleep in short steps so AbortSignal can cancel mid-wait. */
async function abortableDelay(
  totalMs: number,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  let left = totalMs;
  while (left > 0) {
    const step = Math.min(MOCK_ABORT_STEP_MS, left);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, step);
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortError());
      };
      if (signal) {
        if (signal.aborted) {
          clearTimeout(timer);
          reject(abortError());
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
    left -= step;
  }
}

/**
 * Local MockChat — no network. Returns text + structured marks.
 * Marks are applied to HTML by the store via applyMarksHtml / completeResultToHtml.
 */
export class MockChat implements ChatPort {
  async complete(input: ChatCompleteInput): Promise<ChatCompleteResult> {
    // When a signal is provided, poll a short delay so cancelInflight can win races.
    if (input.signal) {
      await abortableDelay(MOCK_ABORT_BUDGET_MS, input.signal);
    }
    throwIfAborted(input.signal);

    const lastUser = [...input.messages]
      .reverse()
      .find((m) => m.role === "user");
    const q = (lastUser?.content ?? "").trim() || "（空消息）";
    const marks = pickMarks(q, input.scope);
    const terms = marks.map((m) => m.term).join("、");
    const hint = scopeHint(input.scope);
    const preview = q.length > 80 ? `${q.slice(0, 80)}…` : q;

    const text = [
      `（MockChat）已收到：${preview}${hint}`,
      `可继续点开 ${terms} 做深挖或发散。重生只改本轮，不长新卡。`,
    ].join("\n");

    return { text, marks };
  }

  /**
   * Deterministic short explain — prefix must stay assertable in UI/tests.
   * Must not only echo marks.ts / bare GLOSSARY.explanation.
   */
  async explain(input: ChatExplainInput): Promise<{ text: string }> {
    if (input.signal) {
      await abortableDelay(MOCK_ABORT_BUDGET_MS, input.signal);
    }
    throwIfAborted(input.signal);

    const span = (input.span ?? "").trim() || "（空选区）";
    const preview = span.length > 80 ? `${span.slice(0, 80)}…` : span;
    const hit = GLOSSARY.find((m) => m.term === span || span.includes(m.term));
    const gloss = hit
      ? `${hit.explanation} 可再点深挖/发散继续探究，解释本身不建卡。`
      : `这是对「${preview}」的本地短解释：先弄清含义，再决定是否深挖或发散。解释不落库、不长新卡。`;

    return { text: `（MockExplain）${preview}：${gloss}` };
  }
}

export function createMockChat(): ChatPort {
  return new MockChat();
}
