/** Static demo glossary for mark terms in aiHtml. */
const TERM_BODY: Record<string, string> = {
  函子: "范畴之间的映射：对象→对象，态射→态射，保住复合与单位。",
  范畴: "对象 + 态射 + 复合 + 单位。线性代数里的向量空间与线性映射是例子。",
  自然变换: "函子之间的态射。先站稳函子，再谈这一层。",
};

export function termExplanation(term: string): string {
  const key = term.trim();
  return (
    TERM_BODY[key] ??
    `「${key}」的本地预览（demo）。选深挖继续下钻，或发散平行开一条。`
  );
}

export function isMarkElement(el: EventTarget | null): el is HTMLElement {
  return el instanceof HTMLElement && el.classList.contains("mark");
}

export function markTermFrom(el: HTMLElement): string {
  return (el.getAttribute("data-term") || el.textContent || "").trim();
}
