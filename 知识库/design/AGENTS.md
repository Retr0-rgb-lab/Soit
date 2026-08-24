# 知识库/design/ — HTML prototypes

Throwaway visual/interaction demos. **Not** the shipping app.

Parent: `知识库/AGENTS.md`. Port targets live under `/src`.

## Rules

- Variant **B (Stack)** is the historical main interaction reference (`prototype-workspace.html`).
- Local preview: `python 知识库/design/serve.py` (see folder `README.md`).
- Prototype may load Google Fonts / inline everything; **do not copy CDN font links into `src/` or `index.html`**.
- When porting: map gestures to Soit rules (deepen + diverge only; regenerate in-card) via `docs/` — do not port Explore-only product semantics.
- Do not grow production features only inside this HTML file; land them in `src/` + specs.
