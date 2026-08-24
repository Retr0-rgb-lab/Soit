# 知识库/plans/ — wave execution

Plans split a spec into ordered/parallel work packages with **file ownership**.

Parent: `知识库/AGENTS.md`. Binding acceptance: matching file under `../specs/`.

## Rules

- Read the plan’s “可写” / ownership table before editing; do not touch another parallel plan’s directories.
- Parallel plans must not change shared public signatures they do not own (historically: store public method names frozen while card/shell implement against them).
- When a plan finishes, verification notes belong in plan/README/root README as the plan specifies — do not invent green checkmarks without measurement.
- Plans are not product canon; if a plan fights `docs/共识.md`, stop and fix docs/spec first.
