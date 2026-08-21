# Plan T2: Host tools + prefs

> **Spec:** `2026-08-21-inquiry-tools-search-spec.md` §2.2–2.4  
> Status: implemented under `src-tauri/src/tools/`

## Delivered
- prefs / ssrf / vault_search / fetch_url / web_search
- commands: get_tools_prefs, set_tools_prefs, invoke_inquiry_tool
- permissions + capabilities
- reqwest native-tls

## Acceptance
- [ ] cargo test tools + ssrf + vault_search
- [ ] SSRF denies private IPs
