export type NodeKind = "root" | "deepen" | "diverge";

export interface InquiryNode {
  id: string;
  title: string;
  parentId: string | null;
  kind: NodeKind;
  unread: boolean;
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
  source: "demo" | "empty";
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
