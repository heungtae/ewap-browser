import {
  bindArgument,
  type BindingContext,
  type BoundArgument,
} from "./bind-argument.js";
import { validateFragment } from "./plan.js";
import { type Candidate } from "./schema.js";
export function bindFragment(
  candidate: Candidate,
  sources: ReadonlyMap<string, unknown>,
  context: BindingContext,
): {
  status: "BOUND" | "NEED_INPUT";
  arguments: ReadonlyMap<string, BoundArgument>;
  missing: string[];
} {
  validateFragment(candidate, context.current);
  const argumentsByName = new Map<string, BoundArgument>();
  for (const name of new Set(
    candidate.steps.flatMap((step) => step.parameters),
  )) {
    const resolved = bindArgument(sources.get(name), context);
    argumentsByName.set(
      name,
      resolved.status === "BOUND" &&
        resolved.sourceDigest !== candidate.bindingDigests[name]
        ? { status: "NEED_INPUT", reason: "ARGUMENT_SOURCE_CHANGED" }
        : resolved,
    );
  }
  const missing = [...argumentsByName]
    .filter(([_key, value]) => value.status !== "BOUND")
    .map(([key]) => key);
  return {
    status:
      missing.length ||
      candidate.unresolvedInputs.some((slot) => !argumentsByName.has(slot))
        ? "NEED_INPUT"
        : "BOUND",
    arguments: argumentsByName,
    missing,
  };
}
