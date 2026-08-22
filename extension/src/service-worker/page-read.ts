import type {
  ModelSemanticNode,
  ModelSemanticSnapshot,
  PageReadScope,
} from "../contracts/types.js";
import { fail } from "../security/validation.js";

const scopes = new Set<PageReadScope>([
  "all_dom",
  "visible_only",
  "interactive",
]);
const interactive = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "radio",
  "textbox",
  "tab",
  "menuitem",
]);
const normalize = (value: string): string =>
  value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
const isIncluded = (node: ModelSemanticNode, scope: PageReadScope): boolean =>
  scope === "all_dom" ||
  (scope === "visible_only" && node.visible) ||
  (scope === "interactive" && node.visible && interactive.has(node.role));

export type ReadPageArgs = {
  scope?: PageReadScope;
  parent_model_ref?: string;
  max_chars?: number;
};

export const readPage = (
  snapshot: ModelSemanticSnapshot,
  args: ReadPageArgs = {},
): Pick<
  ModelSemanticSnapshot,
  | "schema_version"
  | "document_epoch"
  | "frame_id"
  | "scope"
  | "truncated"
  | "node_count"
  | "nodes"
> => {
  const scope = args.scope ?? "all_dom";
  if (!scopes.has(scope)) return fail("INVALID_ARGUMENT");
  const maxChars = args.max_chars ?? 50_000;
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > 200_000)
    return fail("INVALID_ARGUMENT");
  const parent = args.parent_model_ref;
  const refs = new Set<string>();
  if (parent) {
    if (!snapshot.nodes.some((node) => node.model_ref === parent))
      return fail("INVALID_ARGUMENT");
    refs.add(parent);
    let grew = true;
    while (grew) {
      grew = false;
      for (const node of snapshot.nodes)
        if (
          node.parent_model_ref &&
          refs.has(node.parent_model_ref) &&
          !refs.has(node.model_ref)
        ) {
          refs.add(node.model_ref);
          grew = true;
        }
    }
  }
  const result: ModelSemanticNode[] = [];
  let chars = 0;
  let truncated = false;
  for (const node of snapshot.nodes) {
    if ((parent && !refs.has(node.model_ref)) || !isIncluded(node, scope))
      continue;
    const cost = node.name.length + node.role.length + 16;
    if (chars + cost > maxChars) {
      truncated = true;
      break;
    }
    result.push(structuredClone(node));
    chars += cost;
  }
  return {
    ...(snapshot.schema_version === 2 ? { schema_version: 2 as const } : {}),
    document_epoch: snapshot.document_epoch,
    frame_id: snapshot.frame_id,
    scope,
    truncated,
    node_count: result.length,
    nodes: result,
  };
};

export const getPageText = (
  snapshot: ModelSemanticSnapshot,
  maxChars = 50_000,
): { text: string; truncated: boolean } => {
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > 50_000)
    return fail("INVALID_ARGUMENT");
  const text = snapshot.visible_text.slice(0, maxChars);
  return { text, truncated: snapshot.visible_text.length > text.length };
};

export const findPage = (
  snapshot: ModelSemanticSnapshot,
  query: string,
  scope: PageReadScope = "all_dom",
  limit = 20,
): Array<
  Pick<
    ModelSemanticNode,
    "model_ref" | "role" | "name" | "visible" | "visibility" | "hidden_reason"
  >
> => {
  if (
    !scopes.has(scope) ||
    !query.trim() ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 20
  )
    return fail("INVALID_ARGUMENT");
  const words = normalize(query).split(" ");
  return snapshot.nodes
    .filter((node) => isIncluded(node, scope))
    .map((node) => {
      const haystack = normalize(`${node.role} ${node.name}`);
      const score = words.reduce(
        (total, word) => total + (haystack.includes(word) ? word.length : 0),
        0,
      );
      return { node, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.node.visible) - Number(left.node.visible) ||
        left.node.model_ref.localeCompare(right.node.model_ref),
    )
    .slice(0, limit)
    .map(({ node }) => ({
      model_ref: node.model_ref,
      role: node.role,
      name: node.name,
      visible: node.visible,
      ...(node.visibility ? { visibility: node.visibility } : {}),
      ...(node.hidden_reason ? { hidden_reason: node.hidden_reason } : {}),
    }));
};
