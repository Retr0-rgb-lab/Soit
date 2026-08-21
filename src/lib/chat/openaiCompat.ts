import type {
  ChatCompleteInput,
  ChatCompleteResult,
  ChatExplainInput,
  ChatPort,
  ChatToolCall,
  ChatWireMessage,
} from "./port";
import { messagesToWire } from "./port";
import type { ChatConfig } from "./config";
import { splitThinkContent, stripThinkForExplain } from "./splitThink";
import { buildInquirySystemPrompt } from "./systemPrompt";

const EXPLAIN_SPAN_MAX = 500;
const EXPLAIN_OUT_MAX = 800;

const EXPLAIN_SYSTEM = [
  "你是探究卡上的短解释助手。",
  "用 2–4 句中文解释用户给出的词或选区，帮助先读懂再决定是否深挖。",
  "禁止大纲、列表、标题、代码块；禁止 [[双括号]] 标记；不要建议建卡。",
  "直接给出解释正文；禁止输出思维链、思考过程、推理步骤或 <think> 标签。",
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

    const wire: ChatWireMessage[] = input.wireMessages?.length
      ? [...input.wireMessages]
      : messagesToWire(input.messages ?? []);

    // Ensure system prompt is first (if not already present as system).
    const hasSystem = wire.some((m) => m.role === "system");
    if (!hasSystem) {
      wire.unshift({
        role: "system",
        content: buildInquirySystemPrompt(input.scope, {
          toolsEnabled: Boolean(input.tools?.length || input.toolsEnabled),
        }),
      });
    }

    const body: Record<string, unknown> = {
      model,
      messages: wire.map(serializeWireMessage),
      temperature: 0.7,
    };

    if (input.tools?.length && input.toolChoice !== "none") {
      body.tools = input.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      body.tool_choice = input.toolChoice === "auto" ? "auto" : "auto";
    } else if (input.toolChoice === "none") {
      body.tool_choice = "none";
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: input.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `Chat API ${res.status}: ${errBody.slice(0, 280) || res.statusText}`,
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
        finish_reason?: string;
      }>;
    };

    const msg = data.choices?.[0]?.message;
    const toolCalls = parseToolCalls(msg?.tool_calls);
    const raw = (msg?.content ?? "").trim();

    if (toolCalls.length) {
      // Intermediate tool round — do not force empty-text placeholder.
      const split = raw ? splitThinkContent(raw) : { text: "", think: "" };
      return {
        text: split.text,
        think: split.think || undefined,
        toolCalls,
      };
    }

    return parseAssistantContent(raw);
  }

  /** Short explain — low temp, truncated span/output; no marks / no think / no tools. */
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
      content: `请解释下列词或选区（2–4 句，只要正文）：\n${span}`,
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
    // PEL-163: hard-hide any leaked chain-of-thought from short explain.
    const text = stripThinkForExplain(raw).slice(0, EXPLAIN_OUT_MAX);
    if (!text) {
      throw new Error("Chat API returned empty explain");
    }
    return { text };
  }
}

function serializeWireMessage(m: ChatWireMessage): Record<string, unknown> {
  if (m.role === "tool") {
    return {
      role: "tool",
      tool_call_id: m.tool_call_id,
      content: m.content,
    };
  }
  if (m.role === "assistant") {
    const out: Record<string, unknown> = {
      role: "assistant",
      content: m.content,
    };
    if (m.tool_calls?.length) {
      out.tool_calls = m.tool_calls;
    }
    return out;
  }
  return { role: m.role, content: m.content };
}

function parseToolCalls(
  raw:
    | Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>
    | undefined,
): ChatToolCall[] {
  if (!raw?.length) return [];
  const out: ChatToolCall[] = [];
  for (const t of raw) {
    const id = (t.id ?? "").trim() || `call_${out.length}`;
    const name = (t.function?.name ?? "").trim();
    if (!name) continue;
    out.push({
      id,
      name,
      arguments: t.function?.arguments ?? "{}",
    });
  }
  return out;
}

/**
 * Parse [[term]] / 【term】 markers into structured marks; strip wrappers from text.
 * Also peels thinking blocks into `think` (PEL-160).
 */
export function parseAssistantContent(raw: string): ChatCompleteResult {
  const split = splitThinkContent(raw);
  const marks: { term: string }[] = [];
  const seen = new Set<string>();
  const pushTerm = (term: string): string => {
    const t = String(term).trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      marks.push({ term: t });
    }
    return t;
  };
  // Primary: [[term]]. Secondary: fullwidth 【term】 (common model noise).
  let text = split.text.replace(/\[\[([^\]]+)\]\]/g, (_full, term: string) =>
    pushTerm(term),
  );
  text = text.replace(/【([^】]+)】/g, (_full, term: string) => pushTerm(term));
  return {
    text,
    marks: marks.length ? marks : undefined,
    think: split.think || undefined,
  };
}

export function createOpenAICompatChat(config: ChatConfig): ChatPort {
  return new OpenAICompatChat(config);
}
