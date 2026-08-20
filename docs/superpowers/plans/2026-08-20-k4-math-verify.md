# Plan K4: docs + demo + full verify

> **Depends on K2 + K3**  
> **Spec:** v1.1 §2.8–2.9 §6  
> **工作目录:** `E:\学习软件\Soit`  
> **可写:** AGENTS, card-read-explain §7 pointer, demoSeed / mock text (light), no redesign

---

### Task 4.1 Docs

- `src/lib/AGENTS.md` — pipeline + math/tex
- `src/components/doc/AGENTS.md` — math in preview
- `docs/superpowers/specs/2026-08-20-card-read-explain-spec.md` §7 — KaTeX → math-katex-spec; katex-only dependency carve-out

### Task 4.2 Demo (light)

- Add one assistant line or demo turn with `$E=mc^2$` and a `$$` fraction in demoSeed if easy

### Task 4.3 Verify

```bash
npm test
npm run build
```

Confirm katex in bundle (optional: ls dist/assets for woff2/katex).

### Task 4.4 Commit

```bash
git commit -m "docs(math): AGENTS and verify KaTeX wave (K4)"
```

## Acceptance
- [ ] full test + build green  
- [ ] 1 commit  
