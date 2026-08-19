export type NodeKind = "root" | "deepen" | "diverge";

/** Snapshot provenance — Wave A load matrix (Spec v1.1). */
export type SnapshotSource = "demo" | "empty" | "universe";

export type InquiryStatus = "active" | "paused" | "done" | "stuck";

export interface InquiryNode {
  id: string;
  title: string;
  parentId: string | null;
  kind: NodeKind;
  unread: boolean;
  /** Host/DB field; optional on demo seeds */
  status?: InquiryStatus | string;
  question?: string | null;
}

export interface Turn {
  id: string;
  title: string;
  collapsed: boolean;
  user: string;
  aiHtml: string; // may contain <span class="mark" data-term="...">
  think: string;
  thinkOpen: boolean;
}

/** Source span on a parent turn — used for edges and return-to-source. */
export interface SourceSpan {
  turnId: string;
  text: string;
  markId?: string;
  start?: number;
  end?: number;
}

/** First-class edge between inquiry cards (deepen | diverge). */
export interface Edge {
  id: string;
  kind: "deepen" | "diverge";
  fromCardId: string;
  toCardId: string;
  source: SourceSpan;
  why?: string;
  actor?: "user" | "agent";
}

export interface WorkspaceSnapshot {
  source: SnapshotSource;
  nodes: InquiryNode[];
  turnsByCardId: Record<string, Turn[]>;
  focusId: string;
  /** Wave B — optional for older/stress snapshots */
  edges?: Edge[];
}

export interface BootstrapState {
  phase: "ready_ui";
  vault: string | null;
  version: string;
}

export interface SelectVaultResult {
  ok: boolean;
  path: string;
  error?: string;
}

export interface OpenUniverseResult {
  ok: boolean;
  path: string;
  error?: string;
  snapshot?: WorkspaceSnapshot;
}

/** Args for Host `spawn_inquiry` (universe path). */
export interface SpawnInquiryHostArgs {
  kind: "deepen" | "diverge";
  fromCardId: string;
  source: SourceSpan;
  why?: string;
  actor?: "user" | "agent";
}

/** Wave D — precipitate_concept result */
export interface PrecipitateConceptResult {
  ok: boolean;
  path?: string;
  bodyWritten: boolean;
  bodySkipped: boolean;
  error?: string;
  cardIds: string[];
}

/** Wave D — append_residue result */
export interface AppendResidueResult {
  ok: boolean;
  path?: string;
  error?: string;
}

/**
 * Wave C — BYOK chat provider config.
 * Stored in app config dir / localStorage — never universe.db.
 */
export interface ChatConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}
