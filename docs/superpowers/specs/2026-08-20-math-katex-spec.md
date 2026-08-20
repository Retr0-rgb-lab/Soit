# 卡片与陪读公式渲染（KaTeX）— Spec v1.1

> 日期: 2026-08-20  
> 依据: 用户确认现状无公式；`renderAssistantHtml` / `MdTextView` 仅 md 子集；`card-read-explain` §7 曾将 KaTeX 后置；冷启动无 CDN；Oracle REVISE → v1.1  
> 基线分支: `main`  
> 前置依赖: card-read-explain 安全 md 子集；PEL-156 Doc `MdTextView`  
> **SSoT:** 本文件。`知识库/specs/` 仅 stub 链。

---

## 摘要

探究卡 AI 回复与资料陪读 md 预览目前把 `$…$` / `$$…$$` 当纯文本。本 Spec 在既有 XSS 管线上插入 math，锁定顺序 **escape → code → math → marks → md → restore**（Doc 无 marks）；引入 **本机打包的 KaTeX**，卡片与陪读共用 `src/lib/math/tex.ts`。不削弱 code/marks 不变量。禁止 CDN；失败降级为等宽源码；主题跟 token。

---

## 0. 前置依赖

| 已有 | 说明 |
|------|------|
| `renderAssistantHtml` | escape → fence/inline code → wrapMarks → md 子集；PH `\uE000n\uE001` |
| `MdTextView` / `renderDocMd` | 同类子集，无 marks；根类名 **`.md-text-view`** |
| `.ai-html` 样式 | `card.css` |
| 冷启动红线 | 无远程字体/CSS CDN |
| card-read-explain §7 | 曾 defer KaTeX → **本 Spec 开做**；并 **定向豁免**「禁止新 npm markdown 重型依赖」**仅限 `katex`** |

---

## 1. 现状

| 事实 | 证据 |
|------|------|
| 无 katex / mathjax / remark-math | `package.json` |
| 卡片无公式 | `assistantHtml.ts` |
| 预览无公式 | `MdTextView.tsx`；宿主 `.md-text-view` |
| 产品曾 defer | card-read-explain §7 |

---

## 2. 需要做的工作

### 2.1 依赖与打包（P0）

1. `npm install katex`（+ 自带 types 即可）。  
2. **P0 锁定：静态**  
   - `import katex from "katex"`（或等价命名空间）  
   - `import "katex/dist/katex.min.css"`（`src/main.tsx` 或全局样式入口）  
3. **同步 API：** `renderAssistantHtml` / `renderDocMd` **不**改为 async。动态 `import()` / 按需 chunk = **P1**（需另设计异步渲染）。  
4. 字体 woff2 随 Vite 打进 `dist`；验收 Network **无** katex CDN / Google fonts。  
5. **豁免声明：** 本波允许运行时依赖 **仅** `katex`。不引入 remark/rehype/mathjax。回写 card-read-explain §7：KaTeX 见本 Spec，非笼统「禁止一切新依赖」。

### 2.2 语法与语义（P0 冻结）

| 形式 | P0 | 输出壳 |
|------|----|--------|
| `$$…$$` | **必做** 块级 | `<div class="soit-math soit-math-block" data-tex="…">` |
| `$…$` | **必做** 行内 | `<span class="soit-math soit-math-inline" data-tex="…">` |
| `\[…\]` / `\(…\)` | **非门禁**（实现许可、单测可选） | 同块/行内 |

**匹配顺序（若实现扩展定界）：** `$$` → `\[` → `\(` → `$`。

**定界规则：**

1. 先保护代码围栏与行内 code；代码内 `$` **永不**数学。  
2. 跳过已是 `PH_ONLY` 的 token 行/片段。  
3. `$…$`：**同一行内**配对；不跨行。  
4. `$$…$$`：可跨行；非重叠从左到右。  
5. 空定界 → 不渲染，保留转义源文。  
6. **货币：** P0 不强制启发式；单测注明「允许 `$12` 偶发误伤」；科学式 `$x_1$` 必须过。

### 2.3 共享核心 `src/lib/math/tex.ts`（P0）

**API（与现 PH 字母表合一）：**

```ts
/**
 * Caller owns slots via the same put() used for code fences
 * (PH_START=\uE000, PH_END=\uE001). Never invent a second PH namespace.
 */
export function protectAndRenderMath(
  escapedWithCodePlaceholders: string,
  put: (html: string) => string,
  opts?: { /* reserved */ },
): string;
```

**合同：**

1. 在 **已 escape、且 code 已 put 掉** 的串上匹配数学。  
2. **Tex body：** `htmlUnescape(extracted)` 后再 `katex.renderToString`  
   （否则 `$a < b$` → `$a &lt; b$` 会算错）。提供/复用 `htmlUnescape`（与 `escapeHtml` 对称，仅处理 `&lt;&gt;&amp;&quot;` 等实体）。  
3. KaTeX 选项：  
   `{ displayMode, throwOnError: true, strict: "ignore", output: "html" }`  
   **try/catch** →  
   `put(\`<code class="soit-math-fallback">${escapeHtml(tex)}</code>\`)`  
   **禁止**把 `throwOnError: false` 的 `.katex-error` 红字当产品态。  
4. 成功：  
   - inline: `put(\`<span class="soit-math soit-math-inline" data-tex="${attrEscape(tex)}">${katexHtml}</span>\`)`  
   - display: `put(\`<div class="soit-math soit-math-block" data-tex="…">…</div>\`)`  
5. **块级隔离（非法 HTML 防护）：** display 的 PH 必须落在 **独立行**（两侧 `\n`），使 `applyMdSubset` 的 `PH_ONLY` 分支像 fence 一样整块输出，**禁止** `<p><div class="soit-math-block">`。  
6. `data-tex` 存 **原始 tex**（unescape 后）；写属性时 `attrEscape`。  
7. 禁止第二套私有 PH 命名空间。

### 2.4 接入 `renderAssistantHtml`（P0）

```text
A. escapeHtml(raw)
B. protect ``` and `code` → put()
C. protectAndRenderMath(s, put)     ← NEW
D. wrapMarksOnEscaped（跳过 PH 与标签内；不对 .soit-math 后代 mark——math 已在槽内）
E. applyMdSubset（PH_ONLY 整块输出；inline math 已在 put 槽，md 见不到内部）
F. restore PH_GLOBAL
```

**`stripHtml`（`port.ts` / 现实现处）：**  
在通用剥标签 **之前**：

- 匹配 `soit-math` + `data-tex`  
- block → `$$${unescape(tex)}$$`  
- inline → `$${unescape(tex)}$`  
- 无 data-tex → 退回剥标签文本  

单测必补。

### 2.5 接入 `MdTextView`（P0）

- 管线：`escape → code put → protectAndRenderMath → md subset → restore`（无 marks）  
- 宿主选择器：**`.md-text-view`**（不是 `.doc-md`）  
- 与 assistant 共用 `put`/PH 字母表约定（可本地复制 PH 常量或抽 `src/lib/htmlPlaceholders.ts`——**P0 允许两端各一份相同常量**，禁止两套不同分隔符）

### 2.6 样式与主题（P0）

| 选择器 | 要求 |
|--------|------|
| `.soit-math-inline` | 不撑破行盒；继承字号 |
| `.soit-math-block` | `overflow-x: auto`；上下 margin；**块级默认居中** |
| `.soit-math-fallback` | 等宽 + muted |
| `.katex` | `color: inherit`（跟 `--ink`）；禁止固定黑字 |
| `.ai-html .soit-math`, `.md-text-view .soit-math` | 两宿主都覆盖 |

墨夜：公式非白底刺眼块。

### 2.7 测试（P0）

| 用例 | 期望 |
|------|------|
| `$a+b$` | `.soit-math-inline` + `.katex` |
| `$a < b$` | 正确公式（unescape） |
| `$$\frac{1}{2}$$` | `.soit-math-block` 且不在非法嵌套 p>div |
| fence / inline code 内 `$a$` | 无 `.soit-math` |
| `**bold**` 与 `$x$` 相邻 | 都生效 |
| mark 与 `$x$` 同句 | mark 不进入 math 内 |
| 非法 tex | `.soit-math-fallback`，不抛 |
| XSS | 无 script |
| stripHtml | 还原 `$`/`$$` |
| 允许 `$12` 误伤 | 文档/测注释即可 |

### 2.8 文档（P1）

- `src/lib/AGENTS.md`、`doc/AGENTS.md`  
- stub 已有  
- 修订 card-read-explain §7 指针  

### 2.9 Demo（P1）

- mock/demo 夹具一行公式；可选 welcome.md  

---

## 3. 文件变更清单

| 文件 | 变更 | 节 |
|------|------|-----|
| `package.json` / lock | `katex` | 2.1 |
| `src/main.tsx`（或入口 css） | katex.css | 2.1 |
| `src/lib/math/tex.ts` + test | 核心 | 2.3 |
| `src/lib/chat/port.ts` | htmlUnescape + stripHtml | 2.3/2.4 |
| `src/lib/chat/assistantHtml.ts` + test | 管线 C | 2.4 |
| `src/components/doc/MdTextView.tsx` | 接 math | 2.5 |
| `card.css` / `doc.css` | 主题 | 2.6 |
| AGENTS + card-read-explain §7 | 文档 | 2.8 |
| demoSeed 等 | 可选 | 2.9 |

---

## 4. 架构图

```text
raw
  → escapeHtml
  → put(code fences / `code`)
  → protectAndRenderMath(s, put)   // unescape tex → katex | fallback
  → wrapMarks (assistant only)
  → md subset (PH_ONLY blocks = fences & display math)
  → restore PH
  → .ai-html | .md-text-view
```

---

## 5. 实施顺序

| 计划 | 内容 | 依赖 | 工作量 |
|------|------|------|--------|
| **K1** | katex+css；`tex.ts`+put 合同；unescape；块级行；单测 | — | **M–L** |
| **K2** | assistantHtml + stripHtml + card.css + 测 | K1 | M |
| **K3** | MdTextView + doc.css + 可选 demo | K1 | S–M |
| **K4** | AGENTS/§7 指针 + npm test/build + 墨夜/Network 验收 | K2,K3 | S |

```text
Wave 1: K1 → K2
Wave 2: K3 → K4
```

K1 冻 API 后 K2/K3 可弱并行（不同文件）。

---

## 6. 验收标准

- [ ] 卡内 `$a+b$`、`$a < b$` 为公式  
- [ ] `$$…$$` 块级可读、可横滚；DOM 无 p>div 非法嵌套  
- [ ] code 内 `$` 不渲染  
- [ ] 陪读 `.md` 同样渲染（`.md-text-view`）  
- [ ] 墨夜公式跟 `--ink`  
- [ ] 非法公式 fallback  
- [ ] `npm test` / `npm run build`  
- [ ] dist 无 CDN 请求；有打包 fonts  
- [ ] XSS 单测  

---

## 7. 不在范围

- Composer WYSIWYG 公式  
- MathJax / AsciiMath / 手写板  
- 动态 import 首屏拆包（P1）  
- GFM 表格/外链  
- PDF 内公式  
- CDN KaTeX  
- `\(`/`\[` 作为 P0 验收门禁（可选实现）  

---

## 8. 风险

| 风险 | 缓解 |
|------|------|
| escape 后 `&lt;` 进 KaTeX | 渲染前 htmlUnescape；测 `$a < b$` |
| 块级进 `<p>` | display PH 独立行 + PH_ONLY |
| bundle 体积 | 静态 P0 接受；P1 再拆 |
| `$` 货币 | 单行规则；允许 `$12` 误伤 |
| marks 拆公式 | math 在 marks 前 |
| 暗色主题 | `.katex { color: inherit }` |
| 双 SSoT 依赖禁令 | 本 Spec 定向豁免 katex + 改 §7 指针 |

---

## 9. 版本变更

| 版本 | 说明 |
|------|------|
| v1.0 | 首版 |
| v1.1 | Oracle：put/PH 合同；tex unescape；块级 PH_ONLY；静态 P0；throwOnError+fallback；`.md-text-view`；`\(` 非门禁；§7 豁免 |
