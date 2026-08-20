import { touchSession } from "../lib/liveSet";
import type { Turn } from "../types";
import { runCompletion } from "./runCompletion";
import {
  isUniverseSource,
  messagesFromTurns,
  nextId,
  patchTurnAi,
  resolveTurnCard,
  scopeForCard,
  type StoreGet,
  type StoreSet,
} from "./turnHelpers";
import { mergeHostSnapshot } from "./spawnMerge";
import type { InquiryInflight, WorkspaceState } from "./workspaceStore";

function applyTurnLocal(
  set: StoreSet,
  cardId: string,
  turn: Turn,
): void {
  set((s) => ({
    turnsByCardId: {
      ...s.turnsByCardId,
      [cardId]: [...(s.turnsByCardId[cardId] ?? []), turn],
    },
    sessionTouchIds: touchSession(s.sessionTouchIds, cardId),
  }));
}

function replaceCardTurns(
  set: StoreSet,
  cardId: string,
  turns: Turn[],
): void {
  set((s) => ({
    turnsByCardId: {
      ...s.turnsByCardId,
      [cardId]: turns,
    },
  }));
}

/** Abort any prior inquiry complete and register a new inflight gen. */
function beginInflight(
  set: StoreSet,
  get: StoreGet,
  cardId: string,
  turnId: string,
  gen: string,
): AbortSignal {
  const prev = get().inquiryInflight;
  if (prev) {
    try {
      prev.controller.abort();
    } catch {
      /* ignore */
    }
  }
  const controller = new AbortController();
  const inflight: InquiryInflight = { cardId, turnId, gen, controller };
  set({ inquiryInflight: inflight });
  return controller.signal;
}

/** Clear inflight only if this gen still owns it. */
function clearInflightIfGen(set: StoreSet, get: StoreGet, gen: string): void {
  const cur = get().inquiryInflight;
  if (cur?.gen === gen) {
    set({ inquiryInflight: null });
  }
}

export function createChatActions(
  set: StoreSet,
  get: StoreGet,
): Pick<
  WorkspaceState,
  | "regenerateTurn"
  | "deleteTurn"
  | "toggleTurnCollapsed"
  | "appendUserMessage"
  | "cancelInflight"
> {
  return {
    cancelInflight: () => {
      const cur = get().inquiryInflight;
      if (!cur) return;
      try {
        cur.controller.abort();
      } catch {
        /* ignore */
      }
      set({ inquiryInflight: null });
    },

    regenerateTurn: async (turnId, cardIdArg) => {
      const s0 = get();
      const rr0 = s0.runtimeRun;
      if (rr0 && (rr0.status === "staging" || rr0.status === "running")) return;
      const resolved = resolveTurnCard(s0, turnId, cardIdArg);
      if (!resolved) return;
      const { cardId, turnIndex } = resolved;

      const turns = s0.turnsByCardId[cardId] ?? [];
      const target = turns[turnIndex]!;
      const messages = messagesFromTurns(turns, {
        untilIndex: turnIndex + 1,
        includeAssistantAtUntil: false,
      });
      // Ensure the regenerated turn's user message is present.
      if (!messages.some((m) => m.role === "user" && m.content === target.user)) {
        if (target.user?.trim()) {
          messages.push({ role: "user", content: target.user });
        }
      }

      const gen = nextId("g");
      const signal = beginInflight(set, get, cardId, turnId, gen);
      patchTurnAi(set, cardId, turnId, {
        think: "重生中…",
        thinkOpen: false,
      });

      try {
        const scope = scopeForCard(get(), cardId);
        await runCompletion({
          get,
          set,
          cardId,
          turnId,
          messages,
          scope,
          gen,
          signal,
          errorLabel: "重生",
        });
      } finally {
        clearInflightIfGen(set, get, gen);
      }
    },

    deleteTurn: async (turnId, cardIdArg) => {
      const s0 = get();
      const resolved = resolveTurnCard(s0, turnId, cardIdArg);
      if (!resolved) return;
      const { cardId } = resolved;

      // Cancel if this turn is mid-complete.
      const inflight = s0.inquiryInflight;
      if (inflight?.cardId === cardId && inflight.turnId === turnId) {
        get().cancelInflight();
      }

      if (isUniverseSource(s0.source)) {
        try {
          const { deleteTurn: hostDelete } = await import("../lib/host");
          const res = await hostDelete({ cardId, turnId });
          if (res.snapshot) {
            mergeHostSnapshot(get, set, res.snapshot, get().focusId);
            return;
          }
        } catch (err) {
          console.error("[soit] delete_turn host failed", err);
          return;
        }
      }

      set((s) => {
        const turns = s.turnsByCardId[cardId];
        if (!turns) return {};
        return {
          turnsByCardId: {
            ...s.turnsByCardId,
            [cardId]: turns.filter((t) => t.id !== turnId),
          },
        };
      });
    },

    toggleTurnCollapsed: async (turnId, cardIdArg) => {
      const s0 = get();
      const resolved = resolveTurnCard(s0, turnId, cardIdArg);
      if (!resolved) return;
      const { cardId } = resolved;
      const turns = s0.turnsByCardId[cardId];
      if (!turns) return;
      const target = turns.find((t) => t.id === turnId);
      if (!target) return;
      const nextCollapsed = !target.collapsed;

      if (isUniverseSource(s0.source)) {
        try {
          const { updateTurn } = await import("../lib/host");
          const res = await updateTurn({
            cardId,
            turnId,
            collapsed: nextCollapsed,
          });
          if (res.snapshot) {
            mergeHostSnapshot(get, set, res.snapshot, get().focusId);
            return;
          }
        } catch (err) {
          console.error("[soit] update_turn collapsed failed", err);
          return;
        }
      }

      replaceCardTurns(
        set,
        cardId,
        turns.map((t) =>
          t.id === turnId ? { ...t, collapsed: nextCollapsed } : t,
        ),
      );
    },

    appendUserMessage: async (text, quote) => {
      const s0 = get();
      const focusId = s0.focusId;
      if (!focusId || !text.trim()) return;
      // Composer lock: mutual exclusion with inquiry + runtime (Spec §2.1 / §2.6).
      if (s0.inquiryInflight) return;
      const rr = s0.runtimeRun;
      if (rr && (rr.status === "staging" || rr.status === "running")) return;

      const body = quote ? `> ${quote}\n\n${text}` : text;
      const title = text.slice(0, 16) || "新消息";
      const gen = nextId("g");
      const cardId = focusId;

      if (isUniverseSource(s0.source)) {
        try {
          const { appendTurn } = await import("../lib/host");
          const res = await appendTurn({
            cardId: focusId,
            title,
            user: body,
          });
          const turnId = res.turn.id;
          if (res.snapshot) {
            mergeHostSnapshot(get, set, res.snapshot, focusId);
          } else {
            const turn: Turn = {
              id: res.turn.id,
              title: res.turn.title || title,
              collapsed: res.turn.collapsed ?? false,
              user: res.turn.user || body,
              think: "生成中…",
              thinkOpen: false,
              aiHtml: res.turn.aiHtml ?? "",
            };
            applyTurnLocal(set, focusId, turn);
          }
          // UI generating marker (not race token).
          patchTurnAi(set, focusId, turnId, {
            think: "生成中…",
            thinkOpen: false,
          });

          const signal = beginInflight(set, get, focusId, turnId, gen);
          try {
            const s1 = get();
            const turns = s1.turnsByCardId[focusId] ?? [];
            const messages = messagesFromTurns(turns, {
              untilIndex: turns.length,
              includeAssistantAtUntil: false,
            });
            const scope = scopeForCard(s1, focusId);
            await runCompletion({
              get,
              set,
              cardId: focusId,
              turnId,
              messages,
              scope,
              gen,
              signal,
              errorLabel: "回复",
            });
          } finally {
            clearInflightIfGen(set, get, gen);
          }
        } catch (err) {
          // append_turn failed — do not pretend success / no ghost turn
          console.error("[soit] append_turn host failed", err);
        }
        return;
      }

      // Demo / memory path
      const turnId = nextId("t");
      const turn: Turn = {
        id: turnId,
        title,
        collapsed: false,
        user: body,
        think: "生成中…",
        thinkOpen: false,
        aiHtml: "",
      };
      applyTurnLocal(set, cardId, turn);

      const signal = beginInflight(set, get, cardId, turnId, gen);
      try {
        const s1 = get();
        const turns = s1.turnsByCardId[cardId] ?? [];
        const messages = messagesFromTurns(turns, {
          untilIndex: turns.length,
          includeAssistantAtUntil: false,
        });
        const scope = scopeForCard(s1, cardId);
        await runCompletion({
          get,
          set,
          cardId,
          turnId,
          messages,
          scope,
          gen,
          signal,
          errorLabel: "回复",
        });
      } finally {
        clearInflightIfGen(set, get, gen);
      }
    },
  };
}
