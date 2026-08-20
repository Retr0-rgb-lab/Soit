# Plan M1: Host list_vault_materials + import_vault_material

> **For agentic workers:** Wave 1; ~0.5–1d; no FE UI  
> **Spec:** `docs/superpowers/specs/2026-08-20-materials-rail-spec.md` v1.1 §2.2  
> **工作目录:** `E:\学习软件\Soit-wt-model-providers`

---

### Task 1.1 Implement list + import

**Files:** extend `src-tauri/src/doc/mod.rs` (or new materials submodule), `lib.rs`, permissions, capabilities, `Cargo.toml` (base64)

- [ ] `list_vault_materials` — materials root only; depth 2; max 200; flatten files; pathRel `materials/...`
- [ ] `import_vault_material` — base64 decode; **max 2_000_000 raw**; sanitize name; write under materials; collision suffix
- [ ] Require universe open
- [ ] Tests: empty list, import ok, too large, path escape
- [ ] `cargo test`
- [ ] Commit: `feat(host): list and import vault materials under materials/ (M1)`

## Acceptance
- [ ] No 15MB constant; 2MB enforced Host-side
- [ ] 1 commit, only tauri files
