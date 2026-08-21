/**
 * Pi-style context compaction (local / extractive).
 *
 * Model (see https://pi.dev/docs/latest/compaction):
 * - Walk older content before a keep-recent boundary
 * - Condense it into a **structured compact**
 * - Keep the newest 1–2 turns at **full fidelity**
 *
 * Soit uses this for:
 * 1. Parent → child fork scope (implicit parent compact)
 * 2. Long same-card threads (messagesFromTurns)
 *
 * v1 is deterministic (no network). Format mirrors Pi sections so a later
 * LLM-polish path can swap the body without changing callers.
 */

import { stripHtml } from "./port";
import type { Turn } from "../../types";

/** Keep last N turns fully intact (user asked for 1–2). */
export const KEEP_RECENT_TURNS = 2;

/**
 * Soft ceiling for the compact body (chars). Not a model window —
 * keeps the implicit system block bounded.
 */
export const COMPACT_BODY_MAX_CHARS = 2400;

/** Pathological single-turn guard (full recent still nearly complete). */
export const FULL_TURN_CHAR_MAX = 12_000;

export type CompactTurn = {
  id?: string;
  title?: string;
  user: string;
  assistant: string;
};

export type CompactMeta = {
  /** Card / parent title */
  title?: string;
  question?: string | null;
  stuck?: string | null;
  next?: string | null;
  /** Fork source span when compacting a parent for a child card */
  spanText?: string;
  kind?: "deepen" | "diverge" | "root" | string;
};

export type CompactSplit<T> = {
  older: T[];
  recent: T[];
};

export type ThreadCompactResult = {
  /** Structured compact of older turns; null if nothing to condense. */
  compact: string | null;
  /** Last KEEP_RECENT_TURNS turns, full text. */
  recent: CompactTurn[];
  /** How many turns were folded into compact. */
  compactedTurnCount: number;
};

export function estimateTokens(text: string): number {
  // Cheap CJK-aware estimate: ~2 chars/token for mixed CN/EN.
  const s = text ?? "";
  return Math.max(1, Math.ceil(s.length / 2));
}

export function turnToCompactTurn(t: Turn): CompactTurn {
  return {
    id: t.id,
    title: t.title,
    user: (t.user ?? "").trim(),
    assistant: stripHtml(t.aiHtml ?? "").trim(),
  };
}

export function clipFull(s: string, max = FULL_TURN_CHAR_MAX): string {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Split so `recent` is the last `keep` items (full fidelity). */
export function splitKeepRecent<T>(
  items: readonly T[],
  keep: number = KEEP_RECENT_TURNS,
): CompactSplit<T> {
  const k = Math.max(0, Math.floor(keep));
  if (!items.length || k <= 0) return { older: [...items], recent: [] };
  if (items.length <= k) return { older: [], recent: [...items] };
  return {
    older: items.slice(0, items.length - k),
    recent: items.slice(items.length - k),
  };
}

function firstLine(s: string, max = 160): string {
  const line = s
    .split(/\n/)
    .map((x) => x.trim())
    .find(Boolean);
  if (!line) return "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function bulletList(items: string[], limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(`- ${t}`);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Pi-like structured summary of older turns (extractive).
 * Sections: Goal, Constraints, Progress, Key Decisions, Critical Context, Next Steps.
 */
export function buildStructuredCompact(
  older: readonly CompactTurn[],
  meta: CompactMeta = {},
): string {
  if (!older.length) return "";

  const goalBits: string[] = [];
  if (meta.question?.trim()) goalBits.push(meta.question.trim());
  if (meta.spanText?.trim()) {
    goalBits.push(`分叉锚点「${meta.spanText.trim()}」`);
  }
  if (meta.title?.trim()) goalBits.push(`探究卡：${meta.title.trim()}`);
  if (!goalBits.length && older[0]?.user) {
    goalBits.push(firstLine(older[0].user, 200));
  }

  const constraints: string[] = [];
  if (meta.stuck?.trim()) constraints.push(`卡住：${meta.stuck.trim()}`);
  if (meta.kind === "diverge") {
    constraints.push("发散支线：勿被父卡结论绑死，可平行探索");
  } else if (meta.kind === "deepen") {
    constraints.push("深挖支线：沿源跨度往下，保持与父问题连贯");
  }

  const progressDone = bulletList(
    older.map((t, i) => {
      const label = t.title?.trim() || `轮次 ${i + 1}`;
      const u = firstLine(t.user, 80);
      const a = firstLine(t.assistant, 100);
      if (u && a) return `${label}：问「${u}」→ ${a}`;
      if (u) return `${label}：${u}`;
      if (a) return `${label}：${a}`;
      return "";
    }),
    8,
  );

  const decisions = bulletList(
    older
      .map((t) => firstLine(t.assistant, 140))
      .filter(Boolean),
    6,
  );

  const critical = bulletList(
    older.flatMap((t) => {
      const bits: string[] = [];
      if (t.user) bits.push(`用户：${firstLine(t.user, 120)}`);
      // Pull [[mark]]-like terms if present in plain assistant text
      const marks = t.assistant.match(/「([^」]{1,24})」/g) ?? [];
      for (const m of marks.slice(0, 3)) bits.push(`术语 ${m}`);
      return bits;
    }),
    8,
  );

  const nextBits: string[] = [];
  if (meta.next?.trim()) nextBits.push(meta.next.trim());
  const lastOlder = older[older.length - 1];
  if (lastOlder?.assistant) {
    const tail = firstLine(lastOlder.assistant, 160);
    if (tail) nextBits.push(`浓缩截止前最后结论：${tail}`);
  }

  const lines: string[] = [
    "（隐式 compact · 父/先前对话浓缩；非用户可见轮次）",
    `折叠轮次：${older.length}`,
  ];
  if (meta.kind) lines.push(`支线：${meta.kind}`);

  const section = (name: string, body: string[]) => {
    lines.push("", `### ${name}`);
    if (!body.length) {
      lines.push("- （无）");
    } else {
      lines.push(...body);
    }
  };

  section(
    "Goal",
    goalBits.length ? goalBits.map((g) => `- ${g}`) : ["- （未标明）"],
  );
  section("Constraints & Preferences", constraints.map((c) => `- ${c}`));
  section("Progress (Done)", progressDone);
  section("Key Decisions", decisions);
  section("Critical Context", critical);
  section(
    "Next Steps",
    nextBits.length ? nextBits.map((n) => `- ${n}`) : ["- （未标明）"],
  );

  let out = lines.join("\n").trim();
  if (out.length > COMPACT_BODY_MAX_CHARS) {
    out = `${out.slice(0, COMPACT_BODY_MAX_CHARS - 1)}…`;
  }
  return out;
}

/** Compact a turn list: structured summary of older + full last 1–2. */
export function compactThread(
  turns: readonly Turn[],
  meta: CompactMeta = {},
  keepRecent: number = KEEP_RECENT_TURNS,
): ThreadCompactResult {
  const all = turns.map(turnToCompactTurn);
  const { older, recent } = splitKeepRecent(all, keepRecent);
  const recentFull = recent.map((t) => ({
    ...t,
    user: clipFull(t.user),
    assistant: clipFull(t.assistant),
  }));

  if (!older.length) {
    return {
      compact: null,
      recent: recentFull,
      compactedTurnCount: 0,
    };
  }

  return {
    compact: buildStructuredCompact(older, meta),
    recent: recentFull,
    compactedTurnCount: older.length,
  };
}

/** Format full recent turns for system / scope prose. */
export function formatRecentDialogue(
  recent: readonly CompactTurn[],
  label = "Recent dialogue (full)",
): string {
  if (!recent.length) return "";
  const lines = [`### ${label}`];
  recent.forEach((t, i) => {
    const n = i + 1;
    const title = t.title?.trim() ? ` · ${t.title.trim()}` : "";
    lines.push("", `#### Turn ${n}${title}`);
    lines.push(`user: ${t.user || "（空）"}`);
    lines.push(`assistant: ${t.assistant || "（空）"}`);
  });
  return lines.join("\n");
}
