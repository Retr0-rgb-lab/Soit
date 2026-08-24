# A8 Verify Log — Agent dual-track (mock P0)

> Date: 2026-08-20  
> Spec: `docs/superpowers/specs/2026-08-20-agent-dual-track-spec.md` v1.1  
> Branch: `main`

## Automated

| Command | Result |
|---------|--------|
| `npm test` | **PASS** 129 tests / 17 files |
| `npm run build` | **PASS** (tsc + vite) |
| `cd src-tauri && cargo test` | **PASS** 59 tests |
| `cargo check` | **PASS** |

## Spec §6 checklist

- [x] 共识双轨（§6.1 + Q15）；禁止外部 session 当源
- [x] `runCompletion` 共用；regenerate 不增 nodes（store tests）
- [x] 可停止；迟到 complete 不写；空回复 `（模型返回为空）`
- [x] `inquiryInflight` ↔ `runtimeRun` 互斥
- [x] `cardBrief` 仅本卡；deepen 无父 turns（fixture）
- [x] 导出/导入路径（store + UI CardAgentMenu）
- [x] `list_runtimes` 含 mock；prefs 默认 `enableSpawn: false`
- [x] Mock handoff +1 turn、nodes 不变、无 spawn_inquiry
- [x] 未绑 vault mock 可用；非 mock + enableSpawn false 拒绝（Rust tests）
- [x] 无 `tauri-plugin-shell`；runs 路径拒绝 `..`
- [x] 设置五段含「运行时」；`section: "runtime"`
- [x] 冷启动无 runtime 探测（仅 RuntimeSection 懒加载）
- [x] 无 transcript→Obsidian 新路径
- [x] 本切片生产文件拆分后 ≤800 LOC（runtimeActions ~432 等）

## P1 deferred

- True CLI adapter (`a9-cli-adapter.md` not executed)
- ACP multi-vendor matrix
- `workspaceAccess: vault-root`

## Key commits (this SPE slice)

- `65f3a81` docs spec+plans
- `9bd4fe2` / `93ebac3` consensus + AGENTS
- `69d44fb` cardBrief + systemPrompt
- `6a0049a` host runtime mock
- `1c4b87c` FE host bridge
- `8d25799` runCompletion + cancel
- `b6e3bc2` handoff store
- `aaa315a` UI runtime + card agent menu
