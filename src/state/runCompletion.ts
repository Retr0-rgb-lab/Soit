import type { ChatMessage } from "../lib/chat";
import { runToolAwareCompletion, stillCurrent } from "./runToolLoop";
import type { StoreGet, StoreSet } from "./turnHelpers";

export { stillCurrent };

/**
 * Shared Inquiry complete pipeline.
 * Delegates to bounded tool loop (tools-search spec).
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
  await runToolAwareCompletion(args);
}
