//! Read path: cards, turns, edges → WorkspaceSnapshotDto.

use super::dto::{EdgeDto, InquiryNodeDto, SourceSpanDto, TurnDto, WorkspaceSnapshotDto};
use super::Universe;

impl Universe {
  pub(super) fn list_edges(&self) -> Result<Vec<EdgeDto>, String> {
    let mut stmt = self
      .conn
      .prepare(
        "SELECT id, kind, from_card_id, to_card_id, source_json, why, actor
         FROM edges ORDER BY created_at ASC, id ASC",
      )
      .map_err(|e| format!("prepare edges: {e}"))?;

    let rows = stmt
      .query_map([], |row| {
        let source_json: Option<String> = row.get(4)?;
        let source = parse_source_span(source_json.as_deref());
        Ok(EdgeDto {
          id: row.get(0)?,
          kind: row.get(1)?,
          from_card_id: row.get(2)?,
          to_card_id: row.get(3)?,
          source,
          why: row.get(5)?,
          actor: row.get(6)?,
        })
      })
      .map_err(|e| format!("query edges: {e}"))?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|e| format!("edges row: {e}"))?;
    Ok(rows)
  }

  pub fn snapshot(&self) -> Result<WorkspaceSnapshotDto, String> {
    let mut stmt = self
      .conn
      .prepare(
        "SELECT id, title, parent_id, kind, unread, status, question, stuck, next_step,
                created_at, updated_at
         FROM cards ORDER BY created_at ASC, id ASC",
      )
      .map_err(|e| format!("prepare cards: {e}"))?;

    let nodes: Vec<InquiryNodeDto> = stmt
      .query_map([], |row| {
        let unread_i: i64 = row.get(4)?;
        Ok(InquiryNodeDto {
          id: row.get(0)?,
          title: row.get(1)?,
          parent_id: row.get(2)?,
          kind: row.get(3)?,
          unread: unread_i != 0,
          status: row.get(5)?,
          question: row.get(6)?,
          stuck: row.get(7)?,
          next: row.get(8)?,
          created_at: row.get(9)?,
          updated_at: row.get(10)?,
        })
      })
      .map_err(|e| format!("query cards: {e}"))?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|e| format!("cards row: {e}"))?;

    let mut turns_by_card_id = std::collections::BTreeMap::new();
    let mut tstmt = self
      .conn
      .prepare(
        "SELECT id, card_id, title, collapsed, user_text, ai_html, think, think_open,
                COALESCE(starred, 0), COALESCE(process_json, '[]'), created_at
         FROM turns ORDER BY sort_order ASC, created_at ASC, id ASC",
      )
      .map_err(|e| format!("prepare turns: {e}"))?;

    let turn_rows = tstmt
      .query_map([], |row| {
        let collapsed_i: i64 = row.get(3)?;
        let think_open_i: i64 = row.get(7)?;
        let starred_i: i64 = row.get(8)?;
        let process_raw: String = row.get(9)?;
        let process = serde_json::from_str(&process_raw).unwrap_or_else(|_| vec![]);
        Ok((
          row.get::<_, String>(1)?,
          TurnDto {
            id: row.get(0)?,
            title: row.get(2)?,
            collapsed: collapsed_i != 0,
            user: row.get(4)?,
            ai_html: row.get(5)?,
            think: row.get(6)?,
            think_open: think_open_i != 0,
            starred: starred_i != 0,
            process,
            created_at: row.get(10)?,
          },
        ))
      })
      .map_err(|e| format!("query turns: {e}"))?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|e| format!("turns row: {e}"))?;

    for (card_id, turn) in turn_rows {
      turns_by_card_id
        .entry(card_id)
        .or_insert_with(Vec::new)
        .push(turn);
    }

    let edges = self.list_edges()?;

    let last_focus = self.get_meta("last_focus_id")?;
    let focus_id = last_focus
      .filter(|id| nodes.iter().any(|n| n.id == *id))
      .or_else(|| {
        nodes
          .iter()
          .find(|n| n.parent_id.is_none())
          .map(|n| n.id.clone())
      })
      .or_else(|| nodes.first().map(|n| n.id.clone()))
      .unwrap_or_default();

    let source = if nodes.is_empty() {
      "empty"
    } else {
      "universe"
    };

    Ok(WorkspaceSnapshotDto {
      source: source.into(),
      nodes,
      turns_by_card_id,
      focus_id,
      edges,
    })
  }
}

fn parse_source_span(raw: Option<&str>) -> SourceSpanDto {
  if let Some(s) = raw {
    if let Ok(span) = serde_json::from_str::<SourceSpanDto>(s) {
      return span;
    }
  }
  SourceSpanDto {
    turn_id: String::new(),
    text: String::new(),
    mark_id: None,
    start: None,
    end: None,
    doc_path: None,
    doc_page: None,
    doc_kind: None,
  }
}
