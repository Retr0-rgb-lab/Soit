# Plan K2: assistantHtml + stripHtml + card math CSS

> **Depends on K1 merged**  
> **Spec:** v1.1 §2.4 §2.6–2.7  
> **工作目录:** `E:\学习软件\Soit`  
> **可写:** `src/lib/chat/assistantHtml.ts`, `assistantHtml.test.ts`, `src/lib/chat/port.ts` (stripHtml only), `src/components/card/card.css`  
> **禁止:** `src/lib/math/**`, `MdTextView.tsx`, `doc.css`, package.json  
> **并行:** 与 K3 并行（文件不重叠）

---

### Task 2.1 Pipeline

In `renderAssistantHtml` after code put, before marks:

```ts
s = protectAndRenderMath(s, put);
```

Import from `../math/tex`.

### Task 2.2 stripHtml

In `port.ts` `stripHtml`: before generic strip, replace soit-math with data-tex back to `$…$` / `$$…$$` (use htmlUnescape from math/tex or local decode of attr entities).

### Task 2.3 card.css

```css
.ai-html .soit-math-inline { … }
.ai-html .soit-math-block { overflow-x: auto; text-align: center; margin: … }
.ai-html .soit-math-fallback { … }
.ai-html .katex { color: inherit; }
```

### Task 2.4 Tests

Extend `assistantHtml.test.ts`:
- `$a+b$` → katex
- `$a < b$`
- fence with `$a$` → no math
- bold + math
- mark + math if easy
- stripHtml roundtrip via exported stripHtml

### Task 2.5 Commit

```bash
npm test -- src/lib/chat/assistantHtml.test.ts src/lib/math/tex.test.ts
npm run build
git commit -m "feat(chat): render KaTeX in assistant HTML pipeline (K2)"
```

## Acceptance
- [ ] assistant math green; build green  
- [ ] 1 commit  
