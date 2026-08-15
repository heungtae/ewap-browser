import type {
  Role,
  SemanticNode,
  SemanticSnapshot,
} from "../contracts/types.js";
import { isSensitive, redactName } from "../security/redaction.js";
import { fail } from "../security/validation.js";
import type { ElementLike, RefRegistry } from "./ref-registry.js";

const supported = new Set<Role>([
  "button",
  "checkbox",
  "combobox",
  "heading",
  "link",
  "option",
  "radio",
  "textbox",
  "listbox",
  "tab",
  "menuitem",
  "dialog",
  "alert",
  "status",
  "navigation",
  "main",
  "form",
]);
export type Collectable = ElementLike & {
  state?: SemanticNode["state"];
  autocomplete?: string;
  parent?: Collectable;
  label?: Collectable;
};
export const collectSemanticProjection = (
  elements: readonly Collectable[],
  registry: RefRegistry,
): SemanticSnapshot => {
  if (elements.length > 500) fail("PAYLOAD_LIMIT_EXCEEDED");
  const ids = new Map<Collectable, string>();
  const included = elements.filter(
    (element) =>
      supported.has(element.role) &&
      element.visible &&
      !isSensitive(element.role, element.name, element.autocomplete),
  );
  for (const element of included) ids.set(element, registry.register(element));
  const nodes = included.map((element) => {
    const parent = element.parent ? ids.get(element.parent) : undefined;
    const label = element.label ? ids.get(element.label) : undefined;
    const refId = ids.get(element);
    if (!refId) return fail("INTERNAL_FAILURE");
    return {
      ref_id: refId,
      role: element.role,
      name: redactName(element.name),
      state: element.state ?? {},
      visible: true,
      enabled: element.enabled,
      ...(parent ? { parent_ref_id: parent } : {}),
      ...(label ? { label_ref_id: label } : {}),
    };
  });
  const snapshot = {
    document_epoch: registry.epoch,
    frame_id: registry.frameId,
    nodes,
  };
  if (Buffer.byteLength(JSON.stringify(snapshot), "utf8") > 256 * 1024)
    fail("PAYLOAD_LIMIT_EXCEEDED");
  return snapshot;
};
