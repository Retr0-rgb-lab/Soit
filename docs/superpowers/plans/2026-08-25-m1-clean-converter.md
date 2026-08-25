# Plan M1: MCP clean 转换器(HTML → text/markdown)

> **For agentic workers:** 独立新文件 + 单测,不碰任何现有文件(除 mod.rs 一行声明)。0.5d。
> **Spec:** `docs/superpowers/specs/2026-08-25-mcp-read-ergonomics-spec.md` §2.1(v1.1)
> **工作目录:** `/home/peleclic/workspace/soit`
> **Wave:** 1(与 M2 并行,文件不相交)

---

### Task 1.1: 新建 `src-tauri/src/mcp/clean.rs`

**Files:**
- Create: `src-tauri/src/mcp/clean.rs`
- Modify: `src-tauri/src/mcp/mod.rs`(仅加一行 `mod clean;`)

- [ ] **Step 1: 读现有渲染管道,确认标签集**
```bash
sed -n '1,120p' src/lib/chat/assistantHtml.ts
sed -n '30,75p' src/lib/math/tex.ts
sed -n '1,60p' src/lib/mermaid.ts
```

- [ ] **Step 2: 写转换器**。接口与规则(spec §2.1 v1.1,含 oracle 修正):

```rust
//! HTML → clean text/markdown for LLM consumers of the Soit MCP.
//! Only the closed tag set produced by src/lib/chat/assistantHtml.ts.

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TextMode { Text, Markdown }

/// Convert rendered assistant HTML (ai_html) to clean text or markdown.
pub fn ai_html_to_clean(html: &str, mode: TextMode) -> String;

/// Entity decode in tex.rs::htmlUnescape order — `&amp;` LAST to avoid
/// double-decoding `&amp;lt;` into `<`.
pub fn html_unescape(s: &str) -> String;
```

实现约束:

- **手写逐字符扫描器**(不用 regex / quick-xml / 新依赖)。状态:`in_svg` / `in_katex_shell`(丢弃区)、`in_pre`(mermaid 判定)、`table` 收集态、行缓冲。
- **实体解码顺序**:`&lt;` → `&gt;` → `&quot;` → `&#39;` → 数字 `&#NNN;` → **最后 `&amp;`**。单 pass 顺序替换,不递归。**所有 textContent / data-tex 属性值输出前都要 html_unescape。**
- **白名单**(spec §2.1 表):
  - `p`/`br` → 换行;`h1..h3`(预留 h4-h6 同规则)→ Text 空行+文本,Markdown `#`..`###`
  - `ul`/`ol`/`li` → `- item`(Markdown ol 用 `1.`;Text 全用 `-`)
  - `strong`/`b` → Text 原文,Markdown `**x**`;`em`/`i` → Text 原文,Markdown `*x*`
  - 行内 `code` → Text 原文,Markdown `` `x` ``
  - `pre`(非 mermaid)→ textContent+unescape;Markdown ```` ``` ```` fence
  - `div.soit-mermaid` → textContent+unescape;Markdown ```` ```mermaid ```` fence(Text 模式原样输出源码,不做 fence)
  - `blockquote` → `> ` 行
  - `table`(含 `div.ai-table-wrap` 透传)→ 两模式都 pipe 表:`|a|b|` + `|---|` 分隔行
  - `.mark[data-term]` → textContent(unescape)
  - `span.ai-link` → label 文本
  - `code.soit-math-fallback` → textContent(即 tex;Markdown 加反引号)
  - `.soit-math` / `.soit-math-inline` / `.soit-math-block` → 读 `data-tex` 属性值,**html_unescape 后**输出 `$tex$`(inline)或 `$$tex$$`(block,Markdown/Text 均独立成行);`data-tex` 缺失 → 丢弃整块
  - `.katex-html` / `svg` / `.katex-mathml` / `math` → **整块丢弃**(进标签即深数计数,直到配对闭合)
  - 未知标签 → textContent(unescape),不递归进子结构
- 输出后处理:行尾空白 trim,连续 3+ 空行合并为 1 个空行,头尾 trim。
- 容错:未闭合标签按 EOF 结束处理;`data-tex` 属性值支持双引号/单引号/无引号三种。

- [ ] **Step 3: 单测(≥20 条,覆盖 spec §6 验收前 6 项)**

```bash
# 测例清单(用 Rust #[cfg(test)] mod tests,fixture 用字符串构造):
# 1 data-tex inline → $...$;2 block → $$...$$ 独立行;3 data-tex 含 &lt; → unescape 还原 <
# 4 svg/katex-mathml 整块丢弃;5 mark data-term → 原文;6 实体顺序 &amp;lt; → &lt; 字面
# 7 GFM table → pipe 表;8 mermaid div → ```mermaid fence 且源码 unescape 还原
# 9 pre code fence;10 行内 code 反引号;11 h1-h3 → #/##/###;12 ul/ol/li
# 13 strong/em Markdown 强调;14 blockquote;15 ai-link label;16 soit-math-fallback
# 17 未知标签 textContent;18 &#39; 数字实体;19 连续空行合并;20 未闭合标签容错
# 21 render 缺 data-tex 的 soit-math 丢弃;22 嵌套 strong+mark 组合
```

- [ ] **Step 4: mod.rs 加声明**
```rust
// src-tauri/src/mcp/mod.rs 顶部 mod 区加:
mod clean;
```

- [ ] **Step 5: 运行测试并 commit**
```bash
cd /home/peleclic/workspace/soit/src-tauri && cargo test mcp 2>&1 | tail -30
cd /home/peleclic/workspace/soit && git add src-tauri/src/mcp/clean.rs src-tauri/src/mcp/mod.rs
git commit -m "feat(mcp): ai_html clean converter (text/markdown) for LLM reads"
```

---

## Acceptance

- [ ] `cargo test mcp` 全绿(新增 ≥20 条单测)
- [ ] 无新依赖(Cargo.toml 未动)
- [ ] `ai_html_to_clean` 对 fixture 输出:无 `svg`/`katex`/`mathml` 子串;`data-tex` 原样还原 `$…$`/`$$…$$`;mermaid 源码含 `<` 时输出 `<` 而非 `&lt;`
- [ ] 1 个 commit
