//! Inquiry Host tools: vault_search / fetch_url / web_search + prefs.

pub mod fetch_url;
pub mod prefs;
pub mod ssrf;
pub mod vault_search;
pub mod web_search;

use prefs::{load_prefs, save_prefs, ToolsPrefsDto};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInvokeResult {
  pub ok: bool,
  pub title: String,
  pub summary: String,
  pub content: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

impl ToolInvokeResult {
  fn ok(title: impl Into<String>, summary: impl Into<String>, content: impl Into<String>) -> Self {
    Self {
      ok: true,
      title: title.into(),
      summary: summary.into(),
      content: content.into(),
      error: None,
    }
  }

  fn err(title: impl Into<String>, error: impl Into<String>) -> Self {
    let error = error.into();
    Self {
      ok: false,
      title: title.into(),
      summary: error.clone(),
      content: error.clone(),
      error: Some(error),
    }
  }
}

pub fn get_tools_prefs(app: AppHandle) -> Result<ToolsPrefsDto, String> {
  load_prefs(&app)
}

pub fn set_tools_prefs(app: AppHandle, prefs: ToolsPrefsDto) -> Result<ToolsPrefsDto, String> {
  save_prefs(&app, &prefs)
}

pub fn invoke_inquiry_tool(
  app: AppHandle,
  state: State<'_, AppState>,
  name: String,
  args_json: String,
) -> Result<ToolInvokeResult, String> {
  let name = name.trim().to_string();
  if name.is_empty() {
    return Ok(ToolInvokeResult::err("工具", "tool name is empty"));
  }

  let prefs = load_prefs(&app).unwrap_or_default();
  if !prefs.tools_enabled {
    return Ok(ToolInvokeResult::err(
      "工具",
      "工具已关闭（设置 → 工具）",
    ));
  }

  let args: Value = serde_json::from_str(&args_json).unwrap_or(Value::Object(Default::default()));

  match name.as_str() {
    "vault_search" => {
      let query = args
        .get("query")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
      let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|n| n as u32);
      let vault = {
        let g = state
          .universe
          .lock()
          .map_err(|_| "universe lock poisoned".to_string())?;
        let u = g
          .as_ref()
          .ok_or_else(|| "no universe open — bind a vault first".to_string())?;
        u.vault_path.clone()
      };
      match vault_search::vault_search(&vault, &query, limit) {
        Ok(v) => {
          let count = v.get("count").and_then(|c| c.as_u64()).unwrap_or(0);
          let content = serde_json::to_string_pretty(&v).unwrap_or_else(|_| "{}".into());
          Ok(ToolInvokeResult::ok(
            "检索库内",
            format!("「{query}」· {count} 条"),
            content,
          ))
        }
        Err(e) => Ok(ToolInvokeResult::err("检索库内", e)),
      }
    }
    "fetch_url" => {
      let url = args
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
      match fetch_url::fetch_url(&url, prefs.allow_loopback_fetch) {
        Ok((title, summary, content)) => Ok(ToolInvokeResult::ok(title, summary, content)),
        Err(e) => Ok(ToolInvokeResult::err("读取链接", e)),
      }
    }
    "web_search" => {
      let query = args
        .get("query")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
      match web_search::web_search(&query, &prefs) {
        Ok((title, summary, content)) => Ok(ToolInvokeResult::ok(title, summary, content)),
        Err(e) => Ok(ToolInvokeResult::err("网页搜索", e)),
      }
    }
    other => Ok(ToolInvokeResult::err(
      "未知工具",
      format!("unknown tool: {other}"),
    )),
  }
}
