/**
 * External runtime bridge DTOs (Spec §2.5).
 * Field names match Rust serde camelCase (`src-tauri/src/runtime/`).
 */

export type RuntimeId =
  | "mock"
  | "opencode"
  | "claude-code"
  | "codex"
  | "kimi"
  | "goose"
  | "custom";

export type RuntimeKind = "mock" | "cli" | "acp";

export interface RuntimeInfo {
  id: RuntimeId | string;
  name: string;
  kind: RuntimeKind | string;
  available: boolean;
  version?: string;
  /** not found / path / built-in note */
  detail?: string;
  bin?: string;
}

export interface RuntimePreferences {
  /** default "mock" */
  defaultRuntimeId: string;
  /** absolute paths override for known RuntimeId keys only */
  binOverrides: Record<string, string>;
  /** allow real process spawn (desktop only); default false */
  enableSpawn: boolean;
}

/** Host `start_runtime_handoff` args (camelCase). */
export interface StartRuntimeHandoffArgs {
  cardId: string;
  runtimeId: string;
  briefMarkdown?: string | null;
}

/** Terminal result from `start_runtime_handoff` (P0: single await). */
export interface HandoffResult {
  runId: string;
  /** idle | staging | running | succeeded | failed | cancelled */
  status: string;
  text?: string;
  error?: string;
}

export interface CancelHandoffResult {
  ok: boolean;
}

export const DEFAULT_RUNTIME_PREFS: RuntimePreferences = {
  defaultRuntimeId: "mock",
  enableSpawn: false,
  binOverrides: {},
};

export const MOCK_RUNTIME_INFO: RuntimeInfo = {
  id: "mock",
  name: "Mock",
  kind: "mock",
  available: true,
  detail: "built-in; no process spawn",
};

/** Browser mock handoff body — must include at least one [[term]]. */
export const MOCK_HANDOFF_TEXT =
  "Mock handoff complete. Next steps for [[函子]] and the inquiry brief.";
