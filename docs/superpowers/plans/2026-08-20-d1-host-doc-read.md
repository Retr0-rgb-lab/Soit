# Plan D1: Host vault doc resolve + read_text

> **For agentic workers:** independent of FE UI; Wave 1; ~0.5–1d  
> **Spec:** `docs/superpowers/specs/2026-08-20-doc-companion-viewer-spec.md` v1.1 §2.2  
> **工作目录:** `E:\学习软件\Soit`

---

### Task 1.1: doc module + path sandbox

**Files:**
- Create: `src-tauri/src/doc/mod.rs`
- Create: `src-tauri/src/doc/path.rs` (optional split)
- Modify: `src-tauri/src/lib.rs` (mod doc; register commands)

- [ ] **Step 1:** Implement `resolve_under_vault(vault, user_path) -> Result<(PathBuf abs, String path_rel), String>`
  - canonicalize vault and candidate
  - must `starts_with(vault_canon)`
  - reject if path under `vault/.soit/`
  - normalize `path_rel` with `/`
- [ ] **Step 2:** `probe_kind(path) -> md|text|pdf|unsupported` by extension
- [ ] **Step 3:** Commands:
  - `resolve_vault_doc(path: String) -> ResolveVaultDocResult`
  - `read_vault_text(path_rel: String, max_bytes: Option<u64>) -> ReadVaultTextResult`
  - require universe open (same pattern as other universe commands)
  - default max_bytes = 1_500_000; oversize → ok:false error
  - UTF-8 strict error on invalid
- [ ] **Step 4:** **Do not** implement base64 PDF read

### Task 1.2: permissions

**Files:**
- Create: `src-tauri/permissions/resolve-vault-doc.toml` (or project convention)
- Create: `src-tauri/permissions/read-vault-text.toml`
- Modify: `src-tauri/capabilities/default.json`

- [ ] Wire `allow-resolve-vault-doc`, `allow-read-vault-text`

### Task 1.3: Rust tests + commit

- [ ] Tests in `doc` module: tempdir vault — ok read md; reject outside; reject `.soit/foo`
- [ ] `cd src-tauri && cargo test`
- [ ] Commit:
```bash
git add src-tauri/src/doc src-tauri/src/lib.rs src-tauri/permissions src-tauri/capabilities/default.json
git commit -m "feat(host): resolve and read vault docs under path sandbox (PEL-156 D1)"
```

---

## Acceptance

- [ ] `cargo test` passes new sandbox tests  
- [ ] No bootstrap/DB open for doc  
- [ ] No base64 PDF command  
- [ ] 1 commit  
