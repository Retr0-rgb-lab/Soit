/**
 * Materials rail session state (materials-rail SPE §2.3).
 * Pure helpers only — Host IO lives in store + host.ts.
 */

import type { MaterialsEntry } from "../types";

export type MaterialsListStatus = "idle" | "loading" | "ready" | "error";

export type MaterialsRailState = {
  open: boolean;
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
    listStatus: "idle",
    entries: [],
    error: null,
    selectedPathRel: null,
    listEpoch: 0,
    importBusy: false,
  };
}

/**
 * map / loadSnapshot — close rail; bump epoch so late list/import landings drop.
 * Does not clear DocSession (doc has its own force_close).
 */
export function forceCloseMaterialsRail(
  state: MaterialsRailState,
): MaterialsRailState {
  return {
    ...state,
    open: false,
    listStatus: "idle",
    error: null,
    importBusy: false,
    listEpoch: state.listEpoch + 1,
  };
}
