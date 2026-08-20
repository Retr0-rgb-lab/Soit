# Plan D4: DocPane UI + AppShell matrix + open entry

> **For agentic workers:** after D3; md/text + PdfGuide only  
> **Spec:** v1.1 §2.5 §2.8  
> **工作目录:** `E:\学习软件\Soit`

---

### Task 4.1: doc components

**Files:**
- Create: `src/components/doc/DocPane.tsx`
- Create: `src/components/doc/MdTextView.tsx`
- Create: `src/components/doc/PdfGuide.tsx`
- Create: `src/components/doc/OpenDocPopover.tsx`
- Create: `src/components/doc/doc.css`
- Create: `src/components/doc/AGENTS.md`

- [ ] DocPane: title, close, layout toggle split/doc-wide, loading/error/retry, body switch md|text|pdf guide
- [ ] MdTextView: text pre; md lightweight safe render (escape; basic newlines/headers optional; **no wrapMarks**)
- [ ] PdfGuide: path + size + copy
- [ ] OpenDocPopover: path input, recent 5 localStorage key `soit-doc-recent`, submit → `openDoc`
- [ ] CSS tokens only

### Task 4.2: AppShell matrix + Esc

**Files:**
- Modify: `src/components/shell/AppShell.tsx`
- Modify: `src/styles/app.css`

- [ ] Implement center-stage matrix from spec §2.5
- [ ] `.workspace-split` layout
- [ ] Esc: settings → palette → close doc if open (peek or full closeDoc) → existing map handling
- [ ] Do not mount Doc with Orbit

### Task 4.3: Composer + palette entry

**Files:**
- Modify: `src/components/card/Composer.tsx`
- Modify: `src/components/shell/CommandPalette.tsx` (if exists)

- [ ] Button/tool opens OpenDocPopover or dispatches `soit:open-doc`
- [ ] Palette command 打开文档

### Task 4.4: Commit

```bash
git add src/components/doc src/components/shell/AppShell.tsx src/styles/app.css src/components/card/Composer.tsx src/components/shell/CommandPalette.tsx
git commit -m "feat(ui): DocPane split stage and open-doc entry (PEL-156 D4)"
```

---

## Acceptance

- [ ] `npm run build` typechecks  
- [ ] Mock path can show split in dev (manual or light test)  
- [ ] No pdf iframe/base64  
- [ ] 1 commit  
