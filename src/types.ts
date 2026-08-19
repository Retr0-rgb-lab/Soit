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

export interface WorkspaceSnapshot {
  source: SnapshotSource;
  nodes: InquiryNode[];
  turnsByCardId: Record<string, Turn[]>;
  focusId: string;
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
