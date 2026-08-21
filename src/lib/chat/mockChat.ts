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
    kind?: string;
    lineage?: string[];
    span?: { text?: string };
    why?: string;
    parent?: { title?: string; status?: string };
    parentStatus?: string;
    parentCompact?: string | null;
    parentCompactedTurnCount?: number;
    parentRecent?: Array<{ user?: string }>;
    parentBridge?: Array<{ user?: string }>;
  };
  const parts: string[] = [];
  if (s.kind) parts.push(s.kind === "diverge" ? "发散" : "深挖");
  if (s.lineage?.length) parts.push(`谱系 ${s.lineage.join("›")}`);
  if (s.parent?.title) parts.push(`父卡「${s.parent.title}」`);
  if (s.span?.text) parts.push(`源跨度「${s.span.text}」`);
  if (s.why) parts.push(`原因：${s.why}`);
  const st = s.parent?.status ?? s.parentStatus;
  if (st) parts.push(`父状态 ${st}`);
  if (s.parentCompact?.trim()) {
    const n = s.parentCompactedTurnCount ?? 0;
    parts.push(n > 0 ? `父compact×${n}` : "父compact");
  }
  const recent = s.parentRecent?.length ? s.parentRecent : s.parentBridge;
  if (recent?.length) {
    const u = recent[recent.length - 1]?.user;
    if (u) {
      parts.push(
        `父近轮完整「${u.slice(0, 32)}${u.length > 32 ? "…" : ""}」`,
      );
    }
  }
  return parts.length ? `（分叉语境：${parts.join(" · ")}）` : "";
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

    const wire = input.wireMessages;
    const plain = input.messages ?? [];

    // After a tool result in wire history → final answer (tool-loop second hop).
    const hasToolResult = wire?.some((m) => m.role === "tool");
    if (hasToolResult) {
      const lastTool = [...(wire ?? [])]
        .reverse()
        .find((m) => m.role === "tool");
      const snippet = (lastTool && "content" in lastTool
        ? lastTool.content
        : ""
      ).slice(0, 120);
      return {
        text: `（MockChat）已根据工具结果作答：${snippet || "（空）"}\n可继续用 [[函子]] 或 [[范畴]] 分叉。`,
        marks: [GLOSSARY[0]!, GLOSSARY[1]!],
        think: "已消费 tool 结果，输出终答。",
      };
    }

    const lastUserContent = (() => {
      if (wire?.length) {
        for (let i = wire.length - 1; i >= 0; i--) {
          const m = wire[i]!;
          if (m.role === "user") return m.content;
        }
      }
      const lastUser = [...plain].reverse().find((m) => m.role === "user");
      return lastUser?.content ?? "";
    })();

    const q = lastUserContent.trim() || "（空消息）";

    // Optional one-shot tool call when tools provided and user asks to search.
    const wantsTool =
      Boolean(input.tools?.length) &&
      input.toolChoice !== "none" &&
      /搜索|检索|search|http:\/\/|https:\/\//i.test(q);

    if (wantsTool) {
      const useFetch = /https?:\/\//i.test(q);
      if (useFetch) {
        const m = q.match(/https?:\/\/[^\s]+/i);
        return {
          text: "",
          think: "需要读取链接。",
          toolCalls: [
            {
              id: "mock_fetch_1",
              name: "fetch_url",
              arguments: JSON.stringify({ url: m?.[0] ?? "https://example.com" }),
            },
          ],
        };
      }
      const useWeb = /网页|web\s*search|联网/i.test(q);
      return {
        text: "",
        think: useWeb ? "需要网页搜索。" : "需要检索库内材料。",
        toolCalls: [
          {
            id: useWeb ? "mock_web_1" : "mock_vault_1",
            name: useWeb ? "web_search" : "vault_search",
            arguments: JSON.stringify({
              query: q.replace(/搜索|检索|search/gi, "").trim() || q,
            }),
          },
        ],
      };
    }

    const marks = pickMarks(q, input.scope);
    const terms = marks.map((m) => m.term).join("、");
    const hint = scopeHint(input.scope);
    const preview = q.length > 80 ? `${q.slice(0, 80)}…` : q;

    const text = [
      `（MockChat）已收到：${preview}${hint}`,
      `可继续点开 ${terms} 做深挖或发散。重生只改本轮，不长新卡。`,
    ].join("\n");

    // Demo think payload so UI toggle can be exercised without a live model.
    const think = `对齐问题意图：${preview.slice(0, 40)}；准备用 ${terms} 作可分叉锚点。`;

    return { text, marks, think };
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
