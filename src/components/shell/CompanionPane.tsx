import DocPane from "../doc/DocPane";
import { useWorkspace } from "../../state/workspaceStore";
import MaterialsList from "./MaterialsRail";

function isDocSurfaceOpen(status: string): boolean {
  return (
    status === "loading" ||
    status === "ready" ||
    status === "error" ||
    status === "closing"
  );
}

/**
 * Single right companion surface: materials list **or** doc preview.
 * Not a third column beside DocPane — list and preview share this slot.
 */
export default function CompanionPane() {
  const materialsOpen = useWorkspace((s) => s.materialsRail.open);
  const view = useWorkspace((s) => s.materialsRail.view);
  const docStatus = useWorkspace((s) => s.docSession.status);
  const showMaterialsList = useWorkspace((s) => s.showMaterialsList);
  const docOpen = isDocSurfaceOpen(docStatus);

  // List wins when companion opened to browse; preview when view=preview or
  // doc opened without materials (path popover / return-to-source).
  const showList = materialsOpen && (view === "list" || !docOpen);
  const showPreview = docOpen && (!materialsOpen || view === "preview");

  if (showList) {
    return <MaterialsList embedded />;
  }
  if (showPreview) {
    return (
      <DocPane
        onBackToList={materialsOpen ? () => showMaterialsList() : undefined}
      />
    );
  }
  return null;
}
