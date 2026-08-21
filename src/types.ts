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
  /** Inquiry stuck note (Host `stuck` column). */
  stuck?: string | null;
  /** Next step (Host `next_step` → FE `next`). */
  next?: string | null;
}

export interface Turn {
  id: string;
  title: string;
  collapsed: boolean;
  user: string;
  aiHtml: string; // may contain <span class="mark" data-term="...">
  think: string;
  thinkOpen: boolean;
  /** PEL-166 — starred for companion catalog. */
  starred?: boolean;
}

/** Source span on a parent turn — used for edges and return-to-source. */
export interface SourceSpan {
  turnId: string;
  text: string;
  markId?: string;
  start?: number;
  end?: number;
  /** Optional doc-companion anchor (PEL-156). */
  docPath?: string;
  docPage?: number;
  docKind?: string;
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
  /** Currently open vault (null when unbound). */
  vault: string | null;
  /**
   * Last successfully opened vault path from app config.
   * Bootstrap never opens DB; cold start stays on hall — user must enter (no silent open).
   */
  lastVault?: string | null;
  version: string;
}

/**
 * App-config session (Host `soit-session.json` / browser LS `soit-session`).
 * Not universe.db. Spec: workspace-hall §2.2.
 */
export interface SessionConfig {
  version: 1;
  lastVault: string | null;
  /** Newest first, ≤8, absolute paths, deduped. */
  recentVaults: string[];
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

/** Wave E — SKILL.md index entry */
export interface SkillInfo {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
}

/**
 * Wave C — BYOK chat provider config (projection of active model).
 * Stored in app config dir / localStorage — never universe.db.
 * Authoritative multi-provider shape: ModelSettings (see lib/chat/modelSettings).
 */
export interface ChatConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

/** Supplier = credentials + OpenAI-compatible endpoint. */
export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  createdAt: number;
  updatedAt: number;
}

/** Model catalog entry under a provider. */
export interface ModelEntry {
  id: string;
  providerId: string;
  modelId: string;
  label?: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Authoritative multi-provider BYOK settings (version 1). */
export interface ModelSettings {
  version: 1;
  providers: Provider[];
  models: ModelEntry[];
  /** Conversation slot; null = Mock. */
  activeModelId: string | null;
  /** Short-explain slot; null = follow activeModelId. */
  explainModelId: string | null;
}

/** Host `append_turn` args (camelCase JSON). */
export interface AppendTurnArgs {
  cardId: string;
  title?: string;
  user: string;
  quote?: string;
}

/** Host `append_turn` result. */
export interface AppendTurnResult {
  turn: Turn;
  snapshot?: WorkspaceSnapshot;
}

/** Host `update_turn` args — only provided fields are patched. */
export interface UpdateTurnArgs {
  cardId: string;
  turnId: string;
  aiHtml?: string;
  think?: string;
  thinkOpen?: boolean;
  collapsed?: boolean;
  title?: string;
  user?: string;
}

/** Host `update_turn` / `delete_turn` / `update_card` ack. */
export interface HostMutationResult {
  ok: true;
  snapshot?: WorkspaceSnapshot;
}

/** Host `delete_turn` args. */
export interface DeleteTurnArgs {
  cardId: string;
  turnId: string;
}

/** Host `update_card` args — only provided fields are patched. */
export interface UpdateCardArgs {
  cardId: string;
  title?: string;
  status?: InquiryStatus;
  question?: string | null;
  stuck?: string | null;
  /** Maps to Host `next_step`. */
  next?: string | null;
  unread?: boolean;
}

/** Host `resolve_vault_doc` kind (PEL-156). */
export type VaultDocKind = "md" | "text" | "pdf" | "unsupported";

/** Host `resolve_vault_doc` result (camelCase JSON). */
export interface ResolveVaultDocResult {
  ok: boolean;
  pathRel?: string;
  pathAbs?: string;
  kind?: VaultDocKind;
  displayName?: string;
  size?: number;
  error?: string;
}

/** Host `read_vault_text` result (camelCase JSON). */
export interface ReadVaultTextResult {
  ok: boolean;
  text?: string;
  error?: string;
}

/** Host `list_vault_materials` entry (materials-rail SPE §2.2). */
export type MaterialsEntryKind = VaultDocKind | "dir" | string;

export interface MaterialsEntry {
  pathRel: string;
  name: string;
  kind: MaterialsEntryKind;
  size: number;
  mtimeMs?: number;
}

/** Host `list_vault_materials` result. */
export interface ListVaultMaterialsResult {
  ok: boolean;
  entries?: MaterialsEntry[];
  truncated?: boolean;
  error?: string;
}

/** Host `import_vault_material` result. */
export interface ImportVaultMaterialResult {
  ok: boolean;
  pathRel?: string;
  error?: string;
}
