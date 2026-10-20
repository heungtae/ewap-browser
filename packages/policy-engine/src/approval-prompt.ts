import { canonical, digest } from "@contextpilot/codebase-schema";
import {
  promptSchema,
  type Argument,
  type PreparedStep,
} from "@contextpilot/tool-registry";
export async function makePrompt(
  step: PreparedStep,
  argument: Argument | undefined,
  now: number,
) {
  if (
    argument === undefined ||
    (await digest(argument)) !== step.argumentDigest
  )
    throw new Error("APPROVAL_PREVIEW_UNAVAILABLE");
  return promptSchema.parse({
    schema: "wca.policy/v1",
    kind: "approval_request",
    id: `prompt_${crypto.randomUUID()}`,
    revision: 1,
    toolCallId: step.toolCallId,
    taskId: step.context.taskId,
    preparedDigest: step.digest,
    contextDigest: await digest(step.context),
    planRevision: step.context.planRevision,
    policyRevision: step.context.policyRevision,
    windowId: step.context.windowId,
    tool: step.tool,
    effect: step.effect,
    target: step.target,
    argumentPreview: canonical(argument),
    disclosureScope: step.disclosureScope,
    expiresAt: Math.min(step.expiresAt, now + 300000),
  });
}
