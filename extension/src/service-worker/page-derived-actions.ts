import type { SemanticSnapshot } from "../contracts/types.js";
import type { ProfileActionTool } from "../profile/profile.js";

const verifier = (declarationId: string): ProfileActionTool["verifier"] => ({
  kind: "semantic-state-transition",
  declaration_id: declarationId,
  // The execution path replaces this with the target's current state just
  // before dispatch. It is deliberately not derived from a stale snapshot.
  pre_state_digest: "",
  required_changes: [],
});

const visibleEnabled = (snapshot: SemanticSnapshot, role: string): boolean =>
  snapshot.nodes.some(
    (node) => node.role === role && node.visible && node.enabled,
  );

export const pageDerivedOptionValues = (
  snapshot: SemanticSnapshot,
  targetRefId?: string,
): string[] =>
  [
    ...new Set(
      snapshot.nodes
        .filter((node) => {
          if (
            node.role !== "option" ||
            !node.visible ||
            !node.enabled ||
            (targetRefId && node.parent_ref_id !== targetRefId)
          )
            return false;
          const parent = snapshot.nodes.find(
            (candidate) => candidate.ref_id === node.parent_ref_id,
          );
          return (
            !!parent &&
            parent.role === "combobox" &&
            parent.visible &&
            parent.enabled
          );
        })
        .map((node) => node.name)
        .filter((name) => name.length > 0),
    ),
  ].slice(0, 128);

/**
 * These definitions are a deliberately narrow, snapshot-derived fallback for
 * ordinary page controls. A signed Page Profile is considered only when this
 * current-page evidence cannot produce a safe candidate.
 */
export const pageDerivedActionTools = (
  snapshot: SemanticSnapshot,
): ProfileActionTool[] => {
  const definitions: ProfileActionTool[] = [];
  const clickRoles = ["button", "tab", "menuitem"] as const;
  const observedClickRoles = clickRoles.filter((role) =>
    visibleEnabled(snapshot, role),
  );
  if (observedClickRoles.length > 0)
    definitions.push({
      tool: "click_by_ref",
      effect: "local-ui-only",
      risk: "R1",
      eligible_roles: observedClickRoles,
      verifier: verifier("page-derived-click-v1"),
    });
  if (
    snapshot.nodes.some(
      (node) =>
        node.role === "link" &&
        node.visible &&
        node.enabled &&
        (node.same_origin_link === true || node.cross_origin_link === true),
    )
  )
    definitions.push({
      tool: "navigate",
      effect: "local-ui-only",
      risk: "R1",
      eligible_roles: ["link"],
      verifier: verifier("page-derived-navigation-v1"),
    });
  if (visibleEnabled(snapshot, "textbox"))
    definitions.push({
      tool: "set_text_by_ref",
      effect: "local-ui-only",
      risk: "R1",
      eligible_roles: ["textbox"],
      verifier: verifier("page-derived-text-v1"),
    });
  const checkedRoles = ["checkbox", "radio"] as const;
  const observedCheckedRoles = checkedRoles.filter((role) =>
    visibleEnabled(snapshot, role),
  );
  if (observedCheckedRoles.length > 0)
    definitions.push({
      tool: "set_checked_by_ref",
      effect: "local-ui-only",
      risk: "R1",
      eligible_roles: observedCheckedRoles,
      verifier: verifier("page-derived-checked-v1"),
    });
  const optionValues = pageDerivedOptionValues(snapshot);
  if (visibleEnabled(snapshot, "combobox") && optionValues.length > 0)
    definitions.push({
      tool: "select_option_by_ref",
      effect: "local-ui-only",
      risk: "R1",
      eligible_roles: ["combobox"],
      verifier: verifier("page-derived-select-v1"),
      option_values: optionValues,
    });
  return definitions;
};

export const selectActActionTools = (
  snapshot: SemanticSnapshot,
  profileTools: readonly ProfileActionTool[],
): {
  discovery: "page-derived" | "profile";
  definitions: ProfileActionTool[];
} => {
  const pageTools = pageDerivedActionTools(snapshot);
  return pageTools.length > 0
    ? { discovery: "page-derived", definitions: pageTools }
    : { discovery: "profile", definitions: [...profileTools] };
};
