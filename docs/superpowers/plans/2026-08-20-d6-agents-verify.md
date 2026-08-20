# Plan D6: AGENTS + stub + verify

> **For agentic workers:** after D5  
> **Spec:** v1.1 §2.7 §6  
> **工作目录:** `E:\学习软件\Soit`

---

### Task 6.1: AGENTS updates

**Files:**
- Modify: `src/components/shell/AGENTS.md`
- Modify: `src/lib/AGENTS.md` (if exists)
- Modify: `src-tauri/AGENTS.md` (if exists)
- Ensure: `src/components/doc/AGENTS.md` from D4
- Ensure: `知识库/specs/2026-08-20-doc-companion-viewer-spec.md` is **stub only** (not full copy)

### Task 6.2: Verify

```bash
npm test
npm run build
cd src-tauri && cargo test
```

- [ ] Fix failures caused by this wave
- [ ] Commit docs + any fixes:
```bash
git add src/components/shell/AGENTS.md src/lib/AGENTS.md src-tauri/AGENTS.md src/components/doc/AGENTS.md 知识库/specs/2026-08-20-doc-companion-viewer-spec.md
git commit -m "docs(doc): AGENTS and verify PEL-156 doc companion (D6)"
```

---

## Acceptance

- [ ] npm test + build + cargo test green  
- [ ] Spec SSoT only under docs/superpowers/specs  
- [ ] 1 commit (or 2 if fix separate)  
