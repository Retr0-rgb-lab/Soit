/**
 * Lazy Mermaid rendering for assistant turns + doc companion.
 * Mermaid is heavy (~1MB+) — dynamically imported only when a `soit-mermaid`
 * block actually appears in the DOM, so cold start stays light.
 *
 * Placeholders are emitted by the md pipelines (assistantHtml.ts / MdTextView.tsx)
 * as `<div class="soit-mermaid">ESCAPED_SOURCE</div>`. `textContent` yields the
 * decoded raw source, which is then rendered to SVG in place.
 */

export const MERMAID_CLASS = "soit-mermaid";

type Mermaid = typeof import("mermaid").default;

let mermaidPromise: Promise<Mermaid> | null = null;

function loadMermaid(): Promise<Mermaid> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => {
      const mermaid = mod.default as Mermaid;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "neutral",
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

/** Render pending `.soit-mermaid` placeholders under `root` (idempotent). */
export async function renderMermaidBlocks(root: ParentNode): Promise<void> {
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>(`.${MERMAID_CLASS}`),
  ).filter((n) => !n.hasAttribute("data-rendered"));
  if (nodes.length === 0) return;

  let mermaid: Mermaid;
  try {
    mermaid = await loadMermaid();
  } catch {
    // Chunk failed to load — leave the escaped source visible as text.
    return;
  }

  for (const node of nodes) {
    const code = (node.textContent ?? "").trim();
    if (!code) {
      node.setAttribute("data-rendered", "empty");
      continue;
    }
    try {
      const id = `soit-mmd-${Math.random().toString(36).slice(2, 10)}`;
      const { svg } = await mermaid.render(id, code);
      node.innerHTML = svg;
      node.setAttribute("data-rendered", "ok");
    } catch {
      node.setAttribute("data-rendered", "error");
      node.classList.add("is-error");
      // Keep the source text for the user to inspect.
    }
  }
}
