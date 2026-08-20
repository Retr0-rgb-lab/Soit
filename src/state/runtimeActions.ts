import {
  buildCardBrief,
  cardBriefToMarkdown,
  parseAssistantImport,
  type CardBrief,
} from "../lib/cardBrief";
import { completeResultToHtml } from "../lib/chat";
import { touchSession } from "../lib/liveSet";
import {
  DEFAULT_RUNTIME_PREFS,
  normalizeRuntimePrefs,
  type RuntimePreferences,
} from "../lib/runtime";
import type { Turn } from "../types";
import { mergeHostSnapshot } from "./spawnMerge";
import {
  isUniverseSource,
  nextId,
  patchTurnAi,
  type StoreGet,
  type StoreSet,
} from "./turnHelpers";
import type { RuntimeRun, WorkspaceState } from "./workspaceStore";

function escapeErr(msg: string): string {
  return msg.replace(/</g, "&lt;");
}

function isRuntimeBusy(run: RuntimeRun | null | undefined): boolean {
  return run?.status === "staging" || run?.status === "running";
}

function applyTurnLocal(set: StoreSet, cardId: string, turn: Turn): void {
  set((s) => ({
    turnsByCardId: {
      ...s.turnsByCardId,
      [cardId]: [...(s.turnsByCardId[cardId] ?? []), turn],
    },
    sessionTouchIds: touchSession(s.sessionTouchIds, cardId),
  }));
}

function runtimeStillOwns(
  get: StoreGet,
  cardId: string,
  turnId: string,
): boolean {
  const run = get().runtimeRun;
  if (!run || run.cardId !== cardId || run.turnId !== turnId) return false;
  return run.status === "staging" || run.status === "running";
}

async function writeTurnAi(
  get: StoreGet,
  set: StoreSet,
  cardId: string,
  turnId: string,
  aiHtml: string,
  think = "",
): Promise<void> {
  if (isUniverseSource(get().source)) {
    try {
      const { updateTurn } = await import("../lib/host");
      const res = await updateTurn({ cardId, turnId, aiHtml, think });
      if (res.snapshot) {
        mergeHostSnapshot(get, set, res.snapshot, get().focusId);
        return;
      }
    } catch (err) {
      console.error("[soit] update_turn after handoff failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      patchTurnAi(set, cardId, turnId, {
        aiHtml: `<p><em>写入失败：${escapeErr(msg)}</em></p>`,
        think: "",
      });
      return;
    }
  }
  patchTurnAi(set, cardId, turnId, { aiHtml, think });
}

function handoffResultHtml(result: {
  status: string;
  text?: string;
  error?: string;
}): string {
  if (result.status === "succeeded") {
    let text = result.text ?? "";
    if (!text.trim()) text = "（模型返回为空）";
    return completeResultToHtml(parseAssistantImport(text));
  }
  if (result.status === "cancelled") {
    return "<p><em>已取消</em></p>";
  }
  const msg = result.error?.trim() || result.status || "unknown";
  return `<p><em>Agent 失败：${escapeErr(msg)}</em></p>`;
}

async function resolveSkillsText(): Promise<string | undefined> {
  try {
    const { getEnabledSkillsText } = await import("../lib/host");
    const text = (await getEnabledSkillsText()).trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}

function runtimeDisplayName(
  s: WorkspaceState,
  runtimeId: string,
): string {
  const found = s.runtimes.find((r) => r.id === runtimeId);
  if (found?.name) return found.name;
  if (runtimeId === "mock") return "Mock";
  return runtimeId;
}

/**
 * External runtime handoff + card brief import/export (Spec §2.4 / §2.6 / §2.8).
 * Never spawn_inquiry — results land as turns on the same card.
 */
export function createRuntimeActions(
  set: StoreSet,
  get: StoreGet,
): Pick<
  WorkspaceState,
  | "exportCardBrief"
  | "importAssistantToFocus"
  | "startRuntimeHandoff"
  | "cancelRuntimeHandoff"
  | "refreshRuntimes"
  | "loadRuntimePrefs"
  | "setRuntimePrefs"
> {
  return {
    exportCardBrief: async (cardIdArg) => {
      const s = get();
      const cardId = cardIdArg ?? s.focusId;
      if (!cardId) {
        throw new Error("no card to export");
      }
      if (!s.nodes.some((n) => n.id === cardId)) {
        throw new Error(`card not found: ${cardId}`);
      }
      const skillsText = await resolveSkillsText();
      return buildCardBrief({
        cardId,
        nodes: s.nodes,
        turnsByCardId: s.turnsByCardId,
        edges: s.edges,
        skillsText,
        vaultPath: s.vaultPath,
      }) satisfies CardBrief;
    },

    importAssistantToFocus: async (raw, opts) => {
      const s0 = get();
      const focusId = s0.focusId;
      if (!focusId) return;
      if (s0.inquiryInflight || isRuntimeBusy(s0.runtimeRun)) {
        console.error("[soit] import blocked: inquiry or runtime in flight");
        return;
      }

      if (opts?.asResidue) {
        if (!s0.vaultPath) {
          console.error("[soit] asResidue requires bound vault");
          return;
        }
        try {
          const { appendResidue } = await import("../lib/host");
          await appendResidue(focusId, raw);
        } catch (err) {
          console.error("[soit] append_residue failed", err);
        }
        return;
      }

      const aiHtml = completeResultToHtml(parseAssistantImport(raw));
      const user = "（导入自外部 Agent）";
      const title = "导入";

      if (isUniverseSource(s0.source)) {
        try {
          const { appendTurn, updateTurn } = await import("../lib/host");
          const res = await appendTurn({
            cardId: focusId,
            title,
            user,
          });
          const turnId = res.turn.id;
          if (res.snapshot) {
            mergeHostSnapshot(get, set, res.snapshot, focusId);
          } else {
            applyTurnLocal(set, focusId, {
              id: turnId,
              title: res.turn.title || title,
              collapsed: res.turn.collapsed ?? false,
              user: res.turn.user || user,
              think: "",
              thinkOpen: false,
              aiHtml: "",
            });
          }
          const upd = await updateTurn({
            cardId: focusId,
            turnId,
            aiHtml,
            think: "",
          });
          if (upd.snapshot) {
            mergeHostSnapshot(get, set, upd.snapshot, get().focusId);
          } else {
            patchTurnAi(set, focusId, turnId, { aiHtml, think: "" });
          }
        } catch (err) {
          console.error("[soit] import append/update_turn failed", err);
        }
        return;
      }

      // Demo / memory path
      const turn: Turn = {
        id: nextId("t"),
        title,
        collapsed: false,
        user,
        think: "",
        thinkOpen: false,
        aiHtml,
      };
      applyTurnLocal(set, focusId, turn);
    },

    startRuntimeHandoff: async (opts) => {
      const s0 = get();
      const cardId = opts?.cardId ?? s0.focusId;
      if (!cardId || !s0.nodes.some((n) => n.id === cardId)) return;

      if (s0.inquiryInflight) {
        console.error("[soit] handoff blocked: inquiry in flight");
        return;
      }
      if (isRuntimeBusy(s0.runtimeRun)) {
        console.error("[soit] handoff blocked: runtime already running");
        return;
      }

      const prefs = s0.runtimePrefs ?? DEFAULT_RUNTIME_PREFS;
      const runtimeId = (
        opts?.runtimeId ??
        prefs.defaultRuntimeId ??
        "mock"
      ).trim();
      if (!runtimeId) return;

      const name = runtimeDisplayName(s0, runtimeId);
      const user = `（交给本地 Agent：${name}）`;
      const title = "本地 Agent";
      const provisionalRunId = nextId("run");

      set({
        runtimeRun: {
          runId: provisionalRunId,
          cardId,
          turnId: "",
          runtimeId,
          status: "staging",
        },
      });

      let turnId = "";
      try {
        // Brief for host / browser mock (same card rules as export).
        const skillsText = await resolveSkillsText();
        const brief = buildCardBrief({
          cardId,
          nodes: get().nodes,
          turnsByCardId: get().turnsByCardId,
          edges: get().edges,
          skillsText,
          vaultPath: get().vaultPath,
        });
        const briefMarkdown = cardBriefToMarkdown(brief);

        if (isUniverseSource(get().source)) {
          const { appendTurn } = await import("../lib/host");
          const res = await appendTurn({ cardId, title, user });
          turnId = res.turn.id;
          if (res.snapshot) {
            mergeHostSnapshot(get, set, res.snapshot, get().focusId);
          } else {
            applyTurnLocal(set, cardId, {
              id: turnId,
              title: res.turn.title || title,
              collapsed: res.turn.collapsed ?? false,
              user: res.turn.user || user,
              think: "本地 Agent 执行中…",
              thinkOpen: false,
              aiHtml: "",
            });
          }
        } else {
          turnId = nextId("t");
          applyTurnLocal(set, cardId, {
            id: turnId,
            title,
            collapsed: false,
            user,
            think: "本地 Agent 执行中…",
            thinkOpen: false,
            aiHtml: "",
          });
        }

        // Cancel may have cleared during append.
        if (!get().runtimeRun || get().runtimeRun?.runId !== provisionalRunId) {
          return;
        }

        set({
          runtimeRun: {
            runId: provisionalRunId,
            cardId,
            turnId,
            runtimeId,
            status: "running",
            detail: "本地 Agent 执行中…",
          },
        });
        patchTurnAi(set, cardId, turnId, {
          think: "本地 Agent 执行中…",
          thinkOpen: false,
        });

        const { startRuntimeHandoff } = await import("../lib/host");
        const result = await startRuntimeHandoff({
          cardId,
          runtimeId,
          briefMarkdown,
        });

        if (!runtimeStillOwns(get, cardId, turnId)) return;

        const runId = result.runId || provisionalRunId;
        const terminal =
          result.status === "succeeded" ||
          result.status === "failed" ||
          result.status === "cancelled"
            ? (result.status as RuntimeRun["status"])
            : "failed";

        set({
          runtimeRun: {
            runId,
            cardId,
            turnId,
            runtimeId,
            status: terminal,
            detail: result.error,
          },
        });

        const aiHtml = handoffResultHtml(result);
        await writeTurnAi(get, set, cardId, turnId, aiHtml, "");
      } catch (err) {
        console.error("[soit] startRuntimeHandoff failed", err);
        if (turnId && runtimeStillOwns(get, cardId, turnId)) {
          const msg = err instanceof Error ? err.message : String(err);
          await writeTurnAi(
            get,
            set,
            cardId,
            turnId,
            `<p><em>Agent 失败：${escapeErr(msg)}</em></p>`,
            "",
          );
        }
      } finally {
        // Unlock Composer: clear if this invocation still owns runtimeRun
        // (runId may have been replaced by host result.runId).
        const cur = get().runtimeRun;
        if (!cur) return;
        const sameInvocation =
          cur.runId === provisionalRunId ||
          (Boolean(turnId) && cur.cardId === cardId && cur.turnId === turnId);
        if (sameInvocation) {
          set({ runtimeRun: null });
        }
      }
    },

    cancelRuntimeHandoff: async () => {
      const run = get().runtimeRun;
      if (!isRuntimeBusy(run) || !run) return;

      try {
        const { cancelRuntimeHandoff } = await import("../lib/host");
        await cancelRuntimeHandoff();
      } catch (err) {
        console.error("[soit] cancel_runtime_handoff failed", err);
      }

      const cur = get().runtimeRun;
      if (!cur || cur.runId !== run.runId) return;
      if (cur.cardId !== run.cardId) return;

      if (cur.turnId) {
        const aiHtml = "<p><em>已取消</em></p>";
        await writeTurnAi(get, set, cur.cardId, cur.turnId, aiHtml, "");
      }
      if (get().runtimeRun?.runId === run.runId) {
        set({ runtimeRun: null });
      }
    },

    refreshRuntimes: async () => {
      try {
        const { listRuntimes } = await import("../lib/host");
        const runtimes = await listRuntimes();
        set({ runtimes });
      } catch (err) {
        console.error("[soit] list_runtimes failed", err);
        set({ runtimes: get().runtimes });
      }
    },

    loadRuntimePrefs: async () => {
      try {
        const { getRuntimePrefs } = await import("../lib/host");
        const runtimePrefs = await getRuntimePrefs();
        set({ runtimePrefs });
      } catch (err) {
        console.error("[soit] get_runtime_prefs failed", err);
        set({
          runtimePrefs: get().runtimePrefs ?? {
            ...DEFAULT_RUNTIME_PREFS,
            binOverrides: {},
          },
        });
      }
    },

    setRuntimePrefs: async (partial) => {
      const cur =
        get().runtimePrefs ??
        ({ ...DEFAULT_RUNTIME_PREFS, binOverrides: {} } satisfies RuntimePreferences);
      const merged = normalizeRuntimePrefs({
        defaultRuntimeId: partial.defaultRuntimeId ?? cur.defaultRuntimeId,
        enableSpawn:
          partial.enableSpawn !== undefined
            ? partial.enableSpawn
            : cur.enableSpawn,
        binOverrides: partial.binOverrides ?? cur.binOverrides,
      });
      try {
        const { setRuntimePrefs } = await import("../lib/host");
        const saved = await setRuntimePrefs(merged);
        set({ runtimePrefs: saved });
      } catch (err) {
        console.error("[soit] set_runtime_prefs failed", err);
        set({ runtimePrefs: merged });
      }
    },
  };
}
