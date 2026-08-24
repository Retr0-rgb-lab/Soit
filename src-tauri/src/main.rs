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

/// `soit mcp serve --vault <abs-path>` — read-only stdio MCP server.
/// Accepts an optional `serve` token; `--vault` (or `--vault=<path>`) is required.
fn run_mcp(rest: &[String]) {
  let mut vault: Option<String> = None;
  let mut i = 0;
  while i < rest.len() {
    match rest[i].as_str() {
      "serve" => {}
      "--vault" => {
        i += 1;
        if i < rest.len() {
          vault = Some(rest[i].clone());
        }
      }
      other if other.starts_with("--vault=") => {
        vault = Some(other["--vault=".len()..].to_string());
      }
      other => {
        eprintln!("soit mcp: unknown argument: {other}");
        std::process::exit(2);
      }
    }
    i += 1;
  }
  let Some(vault) = vault else {
    eprintln!("soit mcp serve: missing required --vault <absolute vault path>");
    std::process::exit(2);
  };
  if let Err(e) = app_lib::mcp::run_stdio_serve(std::path::Path::new(&vault)) {
    eprintln!("soit mcp serve: {e}");
    std::process::exit(1);
  }
}
