import type { Role, SemanticSnapshot } from "../contracts/types.js";
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

export const isCustomListboxOption = (
  snapshot: SemanticSnapshot,
  node: SemanticSnapshot["nodes"][number],
): boolean => {
  if (
    node.role !== "option" ||
    !node.visible ||
    !node.enabled ||
    !node.parent_ref_id
  )
    return false;
  const parent = snapshot.nodes.find(
    (candidate) => candidate.ref_id === node.parent_ref_id,
  );
  return parent?.role === "listbox" && parent.visible && parent.enabled;
};

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
 * ordinary page controls when no signed Profile action definitions exist.
 */
export const pageDerivedActionTools = (
  snapshot: SemanticSnapshot,
): ProfileActionTool[] => {
  const definitions: ProfileActionTool[] = [];
  const clickRoles: Role[] = [
    "button",
    "tab",
    "menuitem",
    ...(snapshot.nodes.some((node) => isCustomListboxOption(snapshot, node))
      ? (["option"] as const)
      : []),
  ];
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
        ["link", "menuitem"].includes(node.role) &&
        node.visible &&
        node.enabled &&
        (node.same_origin_link === true || node.cross_origin_link === true),
    )
  )
    definitions.push({
      tool: "navigate",
      effect: "local-ui-only",
      risk: "R1",
      eligible_roles: ["link", "menuitem"],
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
  const selectableTargets = snapshot.nodes.filter(
    (node) =>
      node.role === "combobox" &&
      node.visible &&
      node.enabled &&
      pageDerivedOptionValues(snapshot, node.ref_id).length > 0,
  );
  // One generic tool schema cannot safely bind different option enums to
  // several combobox targets. A declared workflow narrows this to one target;
  // otherwise leave the ambiguous selection out of generic Act discovery.
  const selectableTarget =
    selectableTargets.length === 1 ? selectableTargets[0] : undefined;
  const optionValues = selectableTarget
    ? pageDerivedOptionValues(snapshot, selectableTarget.ref_id)
    : [];
  if (optionValues.length > 0)
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
  if (profileTools.length > 0)
    return { discovery: "profile", definitions: [...profileTools] };
  return {
    discovery: "page-derived",
    definitions: pageDerivedActionTools(snapshot),
  };
};
