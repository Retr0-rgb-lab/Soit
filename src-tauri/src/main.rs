// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  let args: Vec<String> = std::env::args().skip(1).collect();
  if args.first().map(String::as_str) == Some("mcp") {
    run_mcp(&args[1..]);
  } else {
    app_lib::run();
  }
}

/// `soit mcp serve [--vault <abs>]... [--vault A,B] [--allow-any]`
///
/// Read-only stdio MCP server. Registry = explicit `--vault` (order-preserving,
/// dedup, not truncated) + session `recentVaults` fill (cap 8). `--allow-any`
/// bypasses the allowlist. Default workspace = first explicit `--vault`, else
/// `lastVault` if present in registry.
fn run_mcp(rest: &[String]) {
  let mut explicit: Vec<String> = Vec::new();
  let mut allow_any = false;

  let mut i = 0;
  while i < rest.len() {
    match rest[i].as_str() {
      "serve" => {}
      "--allow-any" => allow_any = true,
      "--vault" => {
        i += 1;
        if i < rest.len() {
          push_vaults(&mut explicit, &rest[i]);
        }
      }
      other if other.starts_with("--vault=") => {
        push_vaults(&mut explicit, &other["--vault=".len()..]);
      }
      other => {
        eprintln!("soit mcp: unknown argument: {other}");
        std::process::exit(2);
      }
    }
    i += 1;
  }

  // Relative --vault → reject (must be absolute, matching Universe::open).
  for p in &explicit {
    if !std::path::Path::new(p).is_absolute() {
      eprintln!("soit mcp serve: --vault must be an absolute path: {p}");
      std::process::exit(2);
    }
  }

  // recents from soit-session.json (missing/malformed → empty, silent degrade).
  let config = app_lib::mcp::McpServeConfig::from_cli(explicit, allow_any);

  if let Err(e) = app_lib::mcp::run_stdio_serve(config) {
    eprintln!("soit mcp serve: {e}");
    std::process::exit(1);
  }
}

/// Split a `--vault` value on commas (trim each) and append non-empty parts.
fn push_vaults(out: &mut Vec<String>, value: &str) {
  for part in value.split(',') {
    let t = part.trim();
    if !t.is_empty() {
      out.push(t.to_string());
    }
  }
}
