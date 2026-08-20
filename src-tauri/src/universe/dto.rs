//! IPC / snapshot DTOs (camelCase JSON).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InquiryNodeDto {
  pub id: String,
  pub title: String,
  pub parent_id: Option<String>,
  pub kind: String,
  pub unread: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub status: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub question: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub stuck: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub next: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnDto {
  pub id: String,
  pub title: String,
  pub collapsed: bool,
  pub user: String,
  pub ai_html: String,
  pub think: String,
  pub think_open: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSpanDto {
  pub turn_id: String,
  pub text: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub mark_id: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub start: Option<i64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub end: Option<i64>,
  /// Optional doc-companion anchor (PEL-156).
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub doc_path: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub doc_page: Option<i64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub doc_kind: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeDto {
  pub id: String,
  pub kind: String,
  pub from_card_id: String,
  pub to_card_id: String,
  pub source: SourceSpanDto,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub why: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub actor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshotDto {
  pub source: String,
  pub nodes: Vec<InquiryNodeDto>,
  pub turns_by_card_id: std::collections::BTreeMap<String, Vec<TurnDto>>,
  pub focus_id: String,
  #[serde(default, skip_serializing_if = "Vec::is_empty")]
  pub edges: Vec<EdgeDto>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnInquiryArgs {
  pub kind: String,
  pub from_card_id: String,
  pub source: SourceSpanDto,
  pub why: Option<String>,
  pub actor: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenUniverseResult {
  pub ok: bool,
  pub path: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub snapshot: Option<WorkspaceSnapshotDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendTurnResult {
  pub turn: TurnDto,
  pub snapshot: WorkspaceSnapshotDto,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationResult {
  pub ok: bool,
  pub snapshot: WorkspaceSnapshotDto,
}
