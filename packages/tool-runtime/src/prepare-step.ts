import { canonical, digest } from "@contextpilot/codebase-schema";
import {
  contextSchema,
  mutationTool,
  parseIntent,
  preparedSchema,
  refSchema,
  type ArgumentPort,
  type BrowserPort,
  type PreparedStep,
  type ResolvedArgument,
  type ToolContext,
  type ToolId,
  type ToolRegistry,
} from "@contextpilot/tool-registry";
import { evaluate, type PolicySnapshot } from "@contextpilot/policy-engine";
export interface PreparedRecord {
  step: PreparedStep;
  argument: ResolvedArgument;
  alreadySatisfied: boolean;
  evidenceDigest: string;
}
export function assertCurrent(
  step: PreparedStep,
  current: ToolContext,
  now: number,
): void {
  if (
    canonical(step.context) !== canonical(current) ||
    step.expiresAt <= now ||
    current.deadline <= now ||
    current.leaseExpiresAt <= now
  )
    throw new Error("PREPARED_STALE");
}
export async function prepareStep(
  tool: ToolId,
  input: unknown,
  context: ToolContext,
  registry: ToolRegistry,
  capabilities: ReadonlySet<ToolId>,
  argumentsPort: ArgumentPort,
  browser: BrowserPort,
  policy: PolicySnapshot,
  now: number,
): Promise<PreparedRecord> {
  const c = contextSchema.parse(context);
  const intent = parseIntent(tool, input);
  if (now >= c.deadline || now >= c.leaseExpiresAt)
    throw new Error("LEASE_EXPIRED");
  if (
    !registry.get(tool) ||
    !capabilities.has(tool) ||
    (c.mode === "ask" && mutationTool(tool))
  )
    throw new Error("TOOL_UNAVAILABLE");
  const catalog = await registry.snapshot(c, capabilities);
  if (
    catalog.digest !== c.capabilityDigest ||
    (await digest(policy)) !== c.policyDigest
  )
    throw new Error("CAPABILITY_OR_POLICY_STALE");
  checkReferences(intent, c);
  const argument = await argumentsPort.resolve(tool, intent, c);
  const target = await browser.resolve(tool, intent, c, argument.value);
  if (
    target.target.partitionId !== c.partitionId ||
    target.target.revision !== c.entityRevision ||
    target.predicate.partitionId !== c.partitionId ||
    !target.verifierId ||
    !target.adapterId
  )
    throw new Error("TARGET_BINDING_INVALID");
  if (target.effect.disclosure)
    throw new Error("DISCLOSURE_EXECUTOR_UNAVAILABLE");
  const body = {
    schema: "wca.tool/v1" as const,
    kind: "prepared" as const,
    id: `prepared_${crypto.randomUUID()}`,
    toolCallId: `call_${crypto.randomUUID()}`,
    tool,
    toolVersion: 1 as const,
    context: c,
    target: target.target,
    bindingId: target.bindingId,
    observationDigest: target.observationDigest,
    predicate: target.predicate,
    effect: target.effect,
    argumentDigest: await digest(argument.value),
    argumentSourceDigest: argument.sourceDigest,
    intentDigest: await digest(intent),
    disclosureScope: null,
    expiresAt: Math.min(now + 300000, c.deadline, c.leaseExpiresAt),
  };
  const step = preparedSchema.parse({ ...body, digest: await digest(body) });
  if (evaluate(policy, tool, step.effect, c) === "deny")
    throw new Error("POLICY_DENIED");
  await browser.preflight(step, argument.value);
  const observed = await browser.observe(step, argument.value);
  return {
    step,
    argument,
    alreadySatisfied: observed.passed,
    evidenceDigest: observed.digest,
  };
}
function checkReferences(input: unknown, context: ToolContext): void {
  if (Array.isArray(input)) {
    for (const item of input) checkReferences(item, context);
    return;
  }
  if (!input || typeof input !== "object") return;
  const record = input as Record<string, unknown>;
  if ("partitionId" in record) {
    const ref = refSchema.parse(record);
    if (
      ref.partitionId !== context.partitionId ||
      ref.revision !==
        (ref.kind === "argument" ? context.planRevision : context.graphRevision)
    )
      throw new Error("REF_SCOPE_STALE");
    return;
  }
  for (const value of Object.values(record)) checkReferences(value, context);
}
