import type { Capability, Observation } from "@contextpilot/codebase-schema";
export function capability(record: Observation): Capability | null {
  if (
    !record.control ||
    !record.visible ||
    !record.enabled ||
    (record.control === "text" && !record.editable)
  )
    return null;
  const tool =
    record.control === "link"
      ? "web.navigate"
      : record.control === "text"
        ? "web.fill"
        : ["select", "checkbox", "radio"].includes(record.control)
          ? "web.select"
          : "web.click";
  return {
    tool,
    mode: "act",
    mechanism:
      tool === "web.navigate"
        ? "navigate"
        : tool === "web.click"
          ? "invoke_registered"
          : "edit_control",
    businessEffect: "unknown",
    executable: false,
    reason: "FRESH_BINDING_AND_POLICY_REQUIRED",
    verifier: "dom-control-v1",
    parameter: {
      type:
        tool === "web.fill"
          ? "string"
          : tool === "web.select"
            ? "selection"
            : "none",
      required: record.required,
      min: record.min,
      max: record.max,
      step: record.step,
      pattern: record.pattern,
      options: record.options,
    },
  };
}
