import type {
  ChatCompleteInput,
  ChatCompleteResult,
  ChatExplainInput,
  ChatPort,
} from "./port";
import type { ChatConfig } from "./config";
import { buildInquirySystemPrompt } from "./systemPrompt";

const EXPLAIN_SPAN_MAX = 500;
const EXPLAIN_OUT_MAX = 800;

const EXPLAIN_SYSTEM = [
  "你是探究卡上的短解释助手。",
  "用 2–4 句中文解释用户给出的词或选区，帮助先读懂再决定是否深挖。",
  "禁止大纲、列表、标题、代码块；禁止 [[双括号]] 标记；不要建议建卡。",
].join("");

/**
 * OpenAI-compatible Chat Completions (BYOK).
 * Expects config.baseUrl like `https://api.openai.com/v1` (no trailing slash required).
 */
export class OpenAICompatChat implements ChatPort {
  constructor(private readonly config: ChatConfig) {}

  async complete(input: ChatCompleteInput): Promise<ChatCompleteResult> {
    const base = this.config.baseUrl.replace(/\/+$/, "");
    const url = `${base}/chat/completions`;
    const model = this.config.model.trim() || "gpt-4o-mini";

    const messages = [
      { role: "system" as const, content: buildInquirySystemPrompt(input.scope) },
      ...input.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
      }),
      signal: input.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Chat API ${res.status}: ${body.slice(0, 280) || res.statusText}`,
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    return parseAssistantContent(raw);
  }

  /** Short explain — low temp, truncated span/output; no marks pipeline. */
  async explain(input: ChatExplainInput): Promise<{ text: string }> {
    const base = this.config.baseUrl.replace(/\/+$/, "");
    const url = `${base}/chat/completions`;
    const model = this.config.model.trim() || "gpt-4o-mini";
    const span = (input.span ?? "").trim().slice(0, EXPLAIN_SPAN_MAX) || "（空选区）";

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: EXPLAIN_SYSTEM },
    ];
    if (input.contextMessages?.length) {
      for (const m of input.contextMessages.slice(-6)) {
        messages.push({ role: m.role, content: m.content });
      }
    }
    messages.push({
      role: "user",
      content: `请解释下列词或选区（2–4 句）：\n${span}`,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
      }),
      signal: input.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Chat API ${res.status}: ${body.slice(0, 280) || res.statusText}`,
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    const text = raw.slice(0, EXPLAIN_OUT_MAX);
    if (!text) {
      throw new Error("Chat API returned empty explain");
    }
    return { text };
  }
}

/** Parse [[term]] markers into structured marks; strip brackets from text. */
export function parseAssistantContent(raw: string): ChatCompleteResult {
  const marks: { term: string }[] = [];
  const seen = new Set<string>();
  const text = raw.replace(/\[\[([^\]]+)\]\]/g, (_full, term: string) => {
    const t = String(term).trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      marks.push({ term: t });
    }
    return t;
  });
  return { text, marks: marks.length ? marks : undefined };
}

export function createOpenAICompatChat(config: ChatConfig): ChatPort {
  return new OpenAICompatChat(config);
}
