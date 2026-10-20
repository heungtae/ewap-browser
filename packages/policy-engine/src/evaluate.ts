import { z } from "zod";
import {
  toolIdSchema,
  type Effect,
  type ToolContext,
  type ToolId,
} from "@contextpilot/tool-registry";
export const policySchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  mode: z.enum(["ask", "full", "custom"]),
  siteAllowed: z.boolean(),
  deniedTools: z.array(toolIdSchema).max(21),
  autoUnsubmitted: z.boolean(),
  boundedWrite: z.boolean(),
});
export type PolicySnapshot = z.infer<typeof policySchema>;
export function evaluate(
  input: PolicySnapshot,
  tool: ToolId,
  effect: Effect,
  context: ToolContext,
): "deny" | "explicit" | "policy" {
  const policy = policySchema.parse(input);
  if (
    !policy.siteAllowed ||
    policy.deniedTools.includes(tool) ||
    policy.revision !== context.policyRevision ||
    effect.sensitive
  )
    return "deny";
  const mutation = effect.mechanism !== "read";
  if (context.mode === "ask" && mutation) return "deny";
  if (
    effect.disclosure ||
    effect.bulk ||
    ["destructive", "external_transfer", "unknown"].includes(effect.business)
  )
    return "explicit";
  if (effect.business === "read_only" && effect.mechanism === "read")
    return "policy";
  if (
    effect.business === "unsubmitted" &&
    effect.mechanism === "edit_control" &&
    policy.autoUnsubmitted
  )
    return "policy";
  if (effect.business === "write" && policy.boundedWrite) return "policy";
  return "explicit";
}
