import type { ActivePage } from "../service-worker/page-context-runtime.js";
export function learnedBindingCurrent(
  active: ActivePage,
  original: ActivePage["snapshot"],
  url?: string,
) {
  return (
    (!url || url === active.url) &&
    !active.snapshot.truncated &&
    active.snapshot.document_epoch === original.document_epoch &&
    active.snapshot.scope === original.scope &&
    JSON.stringify(
      active.snapshot.nodes.map((n) => [n.role, n.visible, n.enabled]),
    ) ===
      JSON.stringify(original.nodes.map((n) => [n.role, n.visible, n.enabled]))
  );
}
