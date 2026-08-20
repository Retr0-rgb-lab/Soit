# Plan D5: Doc selection, SourceSpan doc*, spawn, return-to-source

> **For agentic workers:** after D4  
> **Spec:** v1.1 §2.6  
> **工作目录:** `E:\学习软件\Soit`

---

### Task 5.1: Host SourceSpanDto optional doc fields

**Files:**
- Modify: `src-tauri/src/universe/dto.rs`
- Modify: snapshot parse if needed (`snapshot.rs`)

- [ ] Optional `doc_path`, `doc_page`, `doc_kind` on `SourceSpanDto` (camelCase serde)
- [ ] Round-trip old edges without fields

### Task 5.2: DocPane SelectionBar

**Files:**
- Modify: `src/components/doc/DocPane.tsx` or `DocSelection.tsx`
- Modify: reuse `src/components/overlays/SelectionBar.tsx`

- [ ] mouseup selection → bar
- [ ] quote → `formatDocAnchorQuote` → workspace or event to set composer quote (match existing quote plumbing)
- [ ] explain → existing explain path if available; else quote-only + stub ok for minimal
- [ ] preview deepen/diverge → DirectionChooser or direct
- [ ] spawn via **`spawnInquiry` full text**; disable if no turns on focus card
- [ ] source includes docPath, docKind, docPage?, turnId=last turn

### Task 5.3: returnToSource docPath

**Files:**
- Modify: `src/components/card/InquiryCard.tsx` and/or `workspaceStore.returnToSource`

- [ ] If `span.docPath` → focus parent + `openDoc(docPath)` + set cursor page if any
- [ ] Else existing turn highlight

### Task 5.4: Commit

```bash
git add src-tauri/src/universe/dto.rs src-tauri/src/universe/snapshot.rs src/components/doc src/components/card/InquiryCard.tsx src/state/workspaceStore.ts
git commit -m "feat(doc): selection quote/spawn with doc anchors and return-to-source (PEL-156 D5)"
```

---

## Acceptance

- [ ] Spawn edge JSON can carry docPath  
- [ ] No-turn disable  
- [ ] returnToSource opens doc when docPath set  
- [ ] 1 commit  
