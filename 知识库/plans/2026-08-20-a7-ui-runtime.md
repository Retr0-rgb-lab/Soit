# Plan A7: Settings Runtime + Composer stop/handoff UI

> **For agentic workers:** UI only; depends A6 store API  
> **Spec:** v1.1 §2.7  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** 4  
> **冲突注意:** 可改 AppShell/Settings/Composer/InquiryCard；**禁止**改 FocusOrbit/PathLineNav/orbitNav

---

### Task 7.1: Settings 五段

**Files:**
- `src/components/shell/SettingsPanel.tsx` — SettingsSection + NAV order: space, model, **runtime**, skills, about
- `src/components/shell/AppShell.tsx` — `parseSettingsSection` accepts `runtime`
- Create: `src/components/shell/settings/RuntimeSection.tsx` — lazy list/prefs on mount; enableSpawn warning; refresh button
- `settings.css` — minimal

---

### Task 7.2: Composer + Card

**Files:**
- `Composer.tsx` — if inquiryInflight or runtime running: show 停止 / disable send; call cancelInflight or cancelRuntimeHandoff
- `InquiryCard.tsx` or new `CardAgentMenu.tsx`:
  - 导出任务单 → export + clipboard/fallback
  - 粘贴导入 → prompt/textarea → importAssistantToFocus
  - 交给本地 Agent → startRuntimeHandoff
- `card.css` — compact toolbar if needed
- Update `card/AGENTS.md` / `shell/AGENTS.md` if needed

```bash
npm run build
git commit -m "feat(ui): runtime settings section and card agent actions"
```

---

## Acceptance

- [ ] 设置可打开「运行时」
- [ ] 生成中可停止
- [ ] 导出/handoff 入口可见
- [ ] build 通过
- [ ] 未改 orbit 导航文件
