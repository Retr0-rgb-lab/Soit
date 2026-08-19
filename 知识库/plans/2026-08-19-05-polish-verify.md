# Plan 05: Polish + Verify

> **For agentic workers:** After Wave 2 merged. Touch shared files carefully.  
> **Spec:** v1.1 §2.2, §2.4, §6  
> **工作目录:** `E:\学习软件\Soit`  
> **Wave:** 3 · **Depends:** Plan 03 + 04

**Goal:** 动效与 reduced-motion；端到端验收；README 启动实测；修合入冲突与明显 bug。

## Global Constraints

- 首屏无 CDN 字体
- release 冷启动目标 ≤2s（尽力测，记入 README）
- 不引入 Electron / 真模型

---

### Task 1: Motion + a11y polish

**Files:**
- Modify: `src/styles/app.css`, `tokens.css`, minor component classNames

- [ ] **Step 1:** 换卡内容 `.card.enter` opacity/transform；浮层 pop-in；turn-bar fade  
- [ ] **Step 2:** `@media (prefers-reduced-motion: reduce)` 关掉大动画  
- [ ] **Step 3:** focus-visible 轮廓  
- [ ] **Step 4: Commit** `git commit -m "style: card motion and reduced-motion"`

---

### Task 2: Integration fix + docs

- [ ] **Step 1:** `npm run build` 必须通过  
- [ ] **Step 2:** `npx vitest run` 必须通过  
- [ ] **Step 3:** `npm run tauri dev` 手测清单（全勾）：
  - 三栏首屏
  - 点图/列表换卡
  - 深挖发散
  - 标注浮层
  - 发送消息
  - 重生不增节点
- [ ] **Step 4:** 若环境允许：`npm run tauri build` 一次，记录启动观感到 README（≤2s 是否达到）  
- [ ] **Step 5:** Network：确认无 fonts.googleapis.com  
- [ ] **Step 6: Commit** README + fixes

```bash
git add README.md src
git commit -m "docs: verify fast-start scaffold and polish workspace UI"
```

---

## Acceptance

- [ ] Spec §6 清单全部可勾  
- [ ] build + vitest 绿  
- [ ] README 含 WebView2、路径、启动实测  
