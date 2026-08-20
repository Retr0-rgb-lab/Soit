import {
  completeResultToHtml,
  resolvePort,
} from "../lib/chat";
import { touchSession } from "../lib/liveSet";
import type { Turn } from "../types";
import {
  isUniverseSource,
  messagesFromTurns,
  nextId,
  patchTurnAi,
  resolveTurnCard,
  scopeForCard,
  type StoreGet,
  type StoreSet,
  withSkillsSystem,
} from "./turnHelpers";
import { mergeHostSnapshot } from "./spawnMerge";
import type { WorkspaceState } from "./workspaceStore";

function escapeErr(msg: string): string {
  return msg.replace(/</g, "&lt;");
}

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

export function createChatActions(
  set: StoreSet,
  get: StoreGet,
): Pick<
  WorkspaceState,
  "regenerateTurn" | "deleteTurn" | "toggleTurnCollapsed" | "appendUserMessage"
> {
  return {
    regenerateTurn: async (turnId, cardIdArg) => {
      const s0 = get();
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
      patchTurnAi(set, cardId, turnId, {
        think: `重生中…#${gen}`,
        thinkOpen: false,
      });

      const stillCurrent = () => {
        const cur = get().turnsByCardId[cardId]?.find((t) => t.id === turnId);
        return Boolean(cur?.think?.includes(`#${gen}`));
      };

      try {
        const port = await resolvePort();
        const scope = scopeForCard(get(), cardId);
        const withSkills = await withSkillsSystem(messages);
        const result = await port.complete({
          cardId,
          messages: withSkills,
          scope,
        });
        // Drop stale completions after reload / delete / newer regenerate.
        if (!stillCurrent()) return;
        // Mutate turn only — never spawn nodes on regenerate.
        const aiHtml = completeResultToHtml(result);
        const think = result.marks?.length
          ? `marks: ${result.marks.map((m) => m.term).join(", ")}`
          : "";

        if (isUniverseSource(get().source)) {
          try {
            const { updateTurn } = await import("../lib/host");
            const res = await updateTurn({
              cardId,
              turnId,
              aiHtml,
              think,
            });
            if (!stillCurrent()) return;
            if (res.snapshot) {
              mergeHostSnapshot(get, set, res.snapshot, get().focusId);
              return;
            }
          } catch (err) {
            console.error("[soit] update_turn after regenerate failed", err);
            if (!stillCurrent()) return;
            const msg = err instanceof Error ? err.message : String(err);
            patchTurnAi(set, cardId, turnId, {
              aiHtml: `<p><em>重生写入失败：${escapeErr(msg)}</em></p>`,
              think: "",
            });
            return;
          }
        }

        patchTurnAi(set, cardId, turnId, { aiHtml, think });
      } catch (err) {
        if (!stillCurrent()) return;
        const msg = err instanceof Error ? err.message : String(err);
        const aiHtml = `<p><em>重生失败：${escapeErr(msg)}</em></p>`;
        if (isUniverseSource(get().source)) {
          try {
            const { updateTurn } = await import("../lib/host");
            await updateTurn({ cardId, turnId, aiHtml, think: "" });
          } catch (hostErr) {
            console.error("[soit] update_turn error state failed", hostErr);
          }
        }
        patchTurnAi(set, cardId, turnId, { aiHtml, think: "" });
      }
    },

    deleteTurn: async (turnId, cardIdArg) => {
      const s0 = get();
      const resolved = resolveTurnCard(s0, turnId, cardIdArg);
      if (!resolved) return;
      const { cardId } = resolved;

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
      const body = quote ? `> ${quote}\n\n${text}` : text;
      const title = text.slice(0, 16) || "新消息";
      const gen = nextId("g");

      let turnId: string;
      let cardId = focusId;

      if (isUniverseSource(s0.source)) {
        try {
          const { appendTurn, updateTurn } = await import("../lib/host");
          const res = await appendTurn({
            cardId: focusId,
            title,
            user: body,
          });
          turnId = res.turn.id;
          if (res.snapshot) {
            mergeHostSnapshot(get, set, res.snapshot, focusId);
          } else {
            const turn: Turn = {
              id: res.turn.id,
              title: res.turn.title || title,
              collapsed: res.turn.collapsed ?? false,
              user: res.turn.user || body,
              think: `生成中…#${gen}`,
              thinkOpen: false,
              aiHtml: res.turn.aiHtml ?? "",
            };
            applyTurnLocal(set, focusId, turn);
          }
          // Ensure generating marker even after full snapshot merge.
          patchTurnAi(set, focusId, turnId, {
            think: `生成中…#${gen}`,
            thinkOpen: false,
          });

          const stillCurrent = () => {
            const cur = get().turnsByCardId[focusId]?.find((t) => t.id === turnId);
            return Boolean(cur?.think?.includes(`#${gen}`));
          };

          try {
            const s1 = get();
            const turns = s1.turnsByCardId[focusId] ?? [];
            const messages = messagesFromTurns(turns, {
              untilIndex: turns.length,
              includeAssistantAtUntil: false,
            });
            const scope = scopeForCard(s1, focusId);
            const port = await resolvePort();
            const withSkills = await withSkillsSystem(messages);
            const result = await port.complete({
              cardId: focusId,
              messages: withSkills,
              scope,
            });
            if (!stillCurrent()) return;
            const aiHtml = completeResultToHtml(result);
            const think = result.marks?.length
              ? `marks: ${result.marks.map((m) => m.term).join(", ")}`
              : "";
            try {
              const up = await updateTurn({
                cardId: focusId,
                turnId,
                aiHtml,
                think,
              });
              if (!stillCurrent()) return;
              if (up.snapshot) {
                mergeHostSnapshot(get, set, up.snapshot, get().focusId);
                return;
              }
            } catch (err) {
              console.error("[soit] update_turn after append failed", err);
              if (!stillCurrent()) return;
              const msg = err instanceof Error ? err.message : String(err);
              patchTurnAi(set, focusId, turnId, {
                aiHtml: `<p><em>回复写入失败：${escapeErr(msg)}</em></p>`,
                think: "",
              });
              return;
            }
            patchTurnAi(set, focusId, turnId, { aiHtml, think });
          } catch (err) {
            if (!stillCurrent()) return;
            const msg = err instanceof Error ? err.message : String(err);
            const aiHtml = `<p><em>回复失败：${escapeErr(msg)}</em></p>`;
            try {
              await updateTurn({
                cardId: focusId,
                turnId,
                aiHtml,
                think: "",
              });
            } catch (hostErr) {
              console.error("[soit] update_turn error state failed", hostErr);
            }
            patchTurnAi(set, focusId, turnId, { aiHtml, think: "" });
          }
        } catch (err) {
          // append_turn failed — do not pretend success / no ghost turn
          console.error("[soit] append_turn host failed", err);
        }
        return;
      }

      // Demo / memory path
      turnId = nextId("t");
      const turn: Turn = {
        id: turnId,
        title,
        collapsed: false,
        user: body,
        think: `生成中…#${gen}`,
        thinkOpen: false,
        aiHtml: "",
      };
      applyTurnLocal(set, cardId, turn);

      const s1 = get();
      const turns = s1.turnsByCardId[cardId] ?? [];
      const messages = messagesFromTurns(turns, {
        untilIndex: turns.length,
        includeAssistantAtUntil: false,
      });
      const scope = scopeForCard(s1, cardId);

      const stillCurrent = () => {
        const cur = get().turnsByCardId[cardId]?.find((t) => t.id === turnId);
        return Boolean(cur?.think?.includes(`#${gen}`));
      };

      try {
        const port = await resolvePort();
        const withSkills = await withSkillsSystem(messages);
        const result = await port.complete({
          cardId,
          messages: withSkills,
          scope,
        });
        if (!stillCurrent()) return;
        patchTurnAi(set, cardId, turnId, {
          aiHtml: completeResultToHtml(result),
          think: result.marks?.length
            ? `marks: ${result.marks.map((m) => m.term).join(", ")}`
            : "",
        });
      } catch (err) {
        if (!stillCurrent()) return;
        const msg = err instanceof Error ? err.message : String(err);
        patchTurnAi(set, cardId, turnId, {
          aiHtml: `<p><em>回复失败：${escapeErr(msg)}</em></p>`,
          think: "",
        });
      }
    },
  };
}
