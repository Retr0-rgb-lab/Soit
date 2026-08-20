# Plan A1: Theme + font CSS tokens

> **Spec:** appearance-themes-fonts v1.1 §2.1–2.2
> **Wave:** 1 · Parallel A2
> **Owns:** src/styles/tokens.css, src/styles/app.css (body font-size only), card.css reading surfaces font-size

## Tasks
- Five html[data-theme] maps with full color+elevation; ink color-scheme dark
- html[data-font] stacks Windows-first
- html[data-font-size] --font-size-root 14/15/16/18; body uses it
- .ic-msgs, .ic-msg, .ic-dock textarea, .settings-content use inherit or var(--font-size-root)
- paper = current :root values
- Do not touch SettingsPanel
- tsc + npm test
- commit: feat(styles): appearance theme and font CSS tokens
