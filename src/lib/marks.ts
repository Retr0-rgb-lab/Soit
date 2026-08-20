/** DOM helpers for assistant HTML marks (class="mark" data-term). */

export function isMarkElement(el: EventTarget | null): el is HTMLElement {
  return el instanceof HTMLElement && el.classList.contains("mark");
}

export function markTermFrom(el: HTMLElement): string {
  return (el.getAttribute("data-term") || el.textContent || "").trim();
}
