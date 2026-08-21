import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { useWorkspace } from "./state/workspaceStore";
import "katex/dist/katex.min.css";
import "./styles/tokens.css";
import "./styles/app.css";

// Dev-only: same store instance as React (browser tooling / Chrome evaluate).
if (import.meta.env.DEV) {
  (
    window as unknown as { __soitStore?: typeof useWorkspace }
  ).__soitStore = useWorkspace;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
