import { canonical, digest } from "@contextpilot/codebase-schema";
import type {
  Argument,
  Effect,
  Observation,
  SemanticRef,
  ToolContext,
  ToolId,
} from "@contextpilot/tool-registry";
import type { ReviewedAdapter } from "./bindings.js";
export interface ReviewedOperation {
  tool: Extract<
    ToolId,
    "web.navigate" | "web.switch_tab" | "web.invoke_action"
  >;
  target: SemanticRef;
  context: ToolContext;
  effect: Effect;
  adapterId: string;
  verifierId: string;
  validate(value: Argument): boolean;
  observe(value: Argument): Promise<Observation>;
  current(): boolean;
  // Implementation is trusted code, never a model-provided method or URL.
  execute(value: Argument, before: () => void): Promise<{ commands: number }>;
}
export async function bindReviewedOperation(
  op: ReviewedOperation,
): Promise<ReviewedAdapter> {
  if (!op.adapterId || !op.verifierId || op.effect.disclosure)
    throw new Error("REVIEW_REQUIRED");
  const identity = canonical([op.target, op.context, op.effect]);
  return {
    tool: op.tool,
    context: structuredClone(op.context),
    snapshot: {
      bindingId: `binding_${crypto.randomUUID()}`,
      target: op.target,
      observationDigest: await digest(identity),
      predicate: {
        ...op.target,
        kind: "predicate",
        id: `predicate_${crypto.randomUUID()}`,
      },
      effect: op.effect,
      adapterId: op.adapterId,
      verifierId: op.verifierId,
    },
    async preflight(value) {
      if (
        !op.current() ||
        canonical([op.target, op.context, op.effect]) !== identity ||
        !op.validate(value)
      )
        throw new Error("REVIEWED_ACTION_STALE");
    },
    async observe(value) {
      if (!op.current()) throw new Error("VERIFIER_STALE");
      return op.observe(value);
    },
    async dispatch(value, before) {
      if (!op.current() || !op.validate(value))
        throw new Error("REVIEWED_ACTION_STALE");
      return op.execute(value, () => {
        if (!op.current()) throw new Error("REVIEWED_ACTION_STALE");
        before();
      });
    },
  };
}
