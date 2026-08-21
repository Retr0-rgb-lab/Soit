/**
 * Materials rail session state (materials-rail SPE §2.3).
 * Pure helpers only — Host IO lives in store + host.ts.
 */

import type { MaterialsEntry } from "../types";

export type MaterialsListStatus = "idle" | "loading" | "ready" | "error";

/** Within the shared companion pane (list ↔ preview, one surface). */
export type MaterialsCompanionView = "list" | "preview";

/** Companion catalog module (PEL-166). */
export type CompanionSection = "materials" | "stars";

export type MaterialsRailState = {
  /** Companion pane open (shares slot with DocPane — not a third column). */
  open: boolean;
  /** Which module in the right pane: vault files vs starred turns. */
  section: CompanionSection;
  /** list = materials browser; preview = DocSession body in same pane. */
  view: MaterialsCompanionView;
  listStatus: MaterialsListStatus;
  entries: MaterialsEntry[];
  error: string | null;
  selectedPathRel: string | null;
  listEpoch: number;
  importBusy: boolean;
};

export function initialMaterialsRail(): MaterialsRailState {
  return {
    open: false,
    section: "materials",
    view: "list",
    listStatus: "idle",
    entries: [],
    error: null,
    selectedPathRel: null,
    listEpoch: 0,
    importBusy: false,
  };
}

/**
 * map / loadSnapshot — close companion; bump epoch so late list/import landings drop.
 * DocSession still force_closed separately by store.
 */
export function forceCloseMaterialsRail(
  state: MaterialsRailState,
): MaterialsRailState {
  return {
    ...state,
    open: false,
    section: "materials",
    view: "list",
    listStatus: "idle",
    error: null,
    importBusy: false,
    listEpoch: state.listEpoch + 1,
  };
}

/** Right pane shows materials list (not a second dock). */
export function isCompanionListView(state: MaterialsRailState): boolean {
  return state.open && state.view === "list";
}
