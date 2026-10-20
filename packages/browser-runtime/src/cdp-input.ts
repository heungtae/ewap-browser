import { digest } from "@contextpilot/codebase-schema";
import type {
  Argument,
  Effect,
  Observation,
  SemanticRef,
  ToolContext,
} from "@contextpilot/tool-registry";
import type { ReviewedAdapter } from "./bindings.js";
export interface FocusedTextTarget {
  context: ToolContext;
  target: SemanticRef;
  effect: Effect;
  // Trusted current collector checks exact focus, empty editable control and document.
  currentEmptyFocus(): Promise<boolean>;
  observe(value: string): Promise<Observation>;
  insertText(text: string): Promise<void>;
}
// The port admits only Input.insertText; no command name, expression or method input.
export async function bindCdpText(
  target: FocusedTextTarget,
): Promise<ReviewedAdapter> {
  if (
    target.effect.mechanism !== "edit_control" ||
    target.effect.sensitive ||
    target.effect.disclosure
  )
    throw new Error("CDP_TARGET_DENIED");
  const validate = async (value: Argument) => {
    if (
      typeof value !== "string" ||
      value.length > 10000 ||
      !(await target.currentEmptyFocus())
    )
      throw new Error("CDP_FOCUS_STALE");
  };
  return {
    tool: "web.fill",
    context: structuredClone(target.context),
    snapshot: {
      bindingId: `binding_${crypto.randomUUID()}`,
      target: target.target,
      observationDigest: await digest([
        target.target,
        target.context,
        "empty-focused-text",
      ]),
      predicate: {
        ...target.target,
        id: `predicate_${crypto.randomUUID()}`,
        kind: "predicate",
      },
      effect: target.effect,
      adapterId: "cdp-focused-text-v1",
      verifierId: "independent-control-state-v1",
    },
    preflight: validate,
    async observe(value) {
      if (typeof value !== "string") throw new Error("ARGUMENT_TYPE");
      return target.observe(value);
    },
    async dispatch(value, before) {
      await validate(value);
      before();
      try {
        await target.insertText(value as string);
      } catch {
        const error = new Error("CDP_DISPATCH_UNKNOWN") as Error & {
          commands: number;
        };
        error.commands = 1;
        throw error;
      }
      return { commands: 1 };
    },
  };
}
