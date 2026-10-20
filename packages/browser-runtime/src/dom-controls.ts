import { digest } from "@contextpilot/codebase-schema";
import type {
  Argument,
  Effect,
  SemanticRef,
  ToolContext,
  ToolId,
} from "@contextpilot/tool-registry";
import type { ReviewedAdapter } from "./bindings.js";
export interface ControlBinding {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  tool: Extract<ToolId, "web.fill" | "web.select" | "web.click">;
  target: SemanticRef;
  context: ToolContext;
  effect: Effect;
  unique(): boolean;
}
function check(b: ControlBinding, value: Argument): void {
  const e = b.element;
  const view = e.ownerDocument.defaultView;
  if (!view || !e.isConnected || !b.unique())
    throw new Error("TARGET_NOT_UNIQUE");
  const style = view.getComputedStyle(e);
  const rect = e.getBoundingClientRect();
  if (
    style.visibility !== "visible" ||
    style.display === "none" ||
    Number(style.opacity) === 0 ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    throw new Error("TARGET_HIDDEN");
  if (
    e.disabled ||
    e.matches(":disabled") ||
    e.closest('[aria-disabled="true"], [inert]') ||
    ("readOnly" in e && e.readOnly)
  )
    throw new Error("TARGET_DISABLED");
  const hit = e.ownerDocument.elementFromPoint(
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
  );
  if (hit !== e && !e.contains(hit)) throw new Error("TARGET_OCCLUDED");
  const tag = e.tagName.toLowerCase();
  if (b.tool === "web.fill") {
    if (
      typeof value !== "string" ||
      value.length > 10000 ||
      (tag !== "textarea" &&
        !(
          tag === "input" &&
          ["text", "search", "email", "url", "tel"].includes(
            (e as HTMLInputElement).type,
          )
        ))
    )
      throw new Error("CONTROL_UNSUPPORTED");
  } else if (b.tool === "web.select") {
    if (
      tag !== "select" ||
      (e as HTMLSelectElement).multiple ||
      typeof value !== "string"
    )
      throw new Error("CONTROL_UNSUPPORTED");
    const option = Array.from((e as HTMLSelectElement).options).filter(
      (o) => o.value === value,
    );
    if (
      option.length !== 1 ||
      option[0]!.disabled ||
      option[0]!.parentElement?.getAttribute("disabled") !== null
    )
      throw new Error("OPTION_UNAVAILABLE");
  } else if (
    tag !== "input" ||
    !["checkbox", "radio"].includes((e as HTMLInputElement).type) ||
    typeof value !== "boolean" ||
    ((e as HTMLInputElement).type === "radio" && !value)
  )
    throw new Error("CONTROL_UNSUPPORTED");
  if (b.effect.sensitive || b.effect.disclosure)
    throw new Error("SENSITIVE_CONTROL");
}
export async function bindControl(b: ControlBinding): Promise<ReviewedAdapter> {
  const element = b.element;
  const fingerprint = () => ({
    tag: element.tagName,
    type: element.getAttribute("type"),
    name: element.getAttribute("name"),
    form: element.getAttribute("form"),
    outer: element.outerHTML,
  });
  const observed = await digest(fingerprint());
  return {
    tool: b.tool,
    context: structuredClone(b.context),
    snapshot: {
      bindingId: `binding_${crypto.randomUUID()}`,
      target: b.target,
      observationDigest: observed,
      predicate: {
        ...b.target,
        id: `predicate_${crypto.randomUUID()}`,
        kind: "predicate",
      },
      effect: b.effect,
      verifierId: "dom-control-state-v1",
      adapterId: "dom-control-v1",
    },
    async preflight(value) {
      check(b, value);
      if ((await digest(fingerprint())) !== observed)
        throw new Error("CONTROL_CHANGED");
    },
    async observe(value) {
      const actual =
        b.tool === "web.click"
          ? (element as HTMLInputElement).checked
          : element.value;
      if (!element.isConnected || !b.unique())
        throw new Error("VERIFIER_STALE");
      return {
        passed: actual === value,
        digest: await digest({ actual, target: b.target }),
      };
    },
    async dispatch(value, before) {
      check(b, value);
      before();
      if (b.tool === "web.click") element.click();
      else {
        const view = element.ownerDocument.defaultView!;
        const proto =
          b.tool === "web.select"
            ? view.HTMLSelectElement.prototype
            : element.tagName === "TEXTAREA"
              ? view.HTMLTextAreaElement.prototype
              : view.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (!setter) throw new Error("NATIVE_SETTER_UNAVAILABLE");
        setter.call(element, value);
        before();
        element.dispatchEvent(new view.Event("input", { bubbles: true }));
        before();
        element.dispatchEvent(new view.Event("change", { bubbles: true }));
      }
      return { commands: 1 };
    },
  };
}
