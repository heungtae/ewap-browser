import { canonical, digest } from "@contextpilot/codebase-schema";
import type { Approvals, PolicySnapshot } from "@contextpilot/policy-engine";
import type {
  BrowserPort,
  DispatchJournal,
  IntentJournal,
  Receipt,
  ToolContext,
  ToolRegistry,
  ToolId,
} from "@contextpilot/tool-registry";
import type { PreparedRecord } from "./prepare-step.js";
import { assertCurrent } from "./prepare-step.js";
import { bounded } from "./deadline.js";
import { receipt, safeError } from "./receipt.js";
export async function executeStep(
  record: PreparedRecord,
  approvalId: string,
  ports: {
    registry: ToolRegistry;
    capabilities: ReadonlySet<ToolId>;
    browser: BrowserPort;
    journal: DispatchJournal;
    intent: IntentJournal;
    approvals: Approvals;
    context(): ToolContext;
    policy(): PolicySnapshot;
    now(): number;
  },
): Promise<Receipt> {
  const { step, argument } = record;
  const deadline = Math.min(step.expiresAt, ports.now() + 10000);
  const limit = <T>(operation: Promise<T>) =>
    bounded(operation, deadline - ports.now());
  const registryEpoch = ports.registry.epoch();
  if (
    (await ports.registry.snapshot(ports.context(), ports.capabilities))
      .digest !== step.context.capabilityDigest ||
    !ports.capabilities.has(step.tool)
  )
    throw new Error("CAPABILITY_STALE");
  assertCurrent(step, ports.context(), ports.now());
  if ((await digest(argument.value)) !== step.argumentDigest)
    throw new Error("ARGUMENT_CHANGED");
  await ports.approvals.validate(approvalId, step);
  await limit(ports.browser.preflight(step, argument.value));
  await ports.intent.record(step);
  const id = `dispatch_${step.toolCallId}`;
  const reserved = await ports.journal.reserve(id, step);
  if (!reserved.fresh)
    return (
      reserved.receipt ??
      receipt(step, { dispatch: "unknown", error: "DISPATCH_RESERVED_UNKNOWN" })
    );
  let commands = 0;
  let consumed = false;
  let closed = false;
  let started = false;
  let result: Receipt;
  const pinnedPolicy = canonical(ports.policy());
  const beforeSideEffect = () => {
    if (closed || ports.now() >= deadline) throw new Error("TOOL_DEADLINE");
    if (
      ports.registry.epoch() !== registryEpoch ||
      !ports.capabilities.has(step.tool)
    )
      throw new Error("CAPABILITY_STALE");
    ports.approvals.assertActive(approvalId);
    assertCurrent(step, ports.context(), ports.now());
    if (canonical(ports.policy()) !== pinnedPolicy)
      throw new Error("POLICY_CHANGED");
    if (!consumed) {
      ports.approvals.consume(approvalId, step);
      consumed = true;
    }
    started = true;
  };
  try {
    assertCurrent(step, ports.context(), ports.now());
    const pre = await limit(ports.browser.observe(step, argument.value));
    if (pre.passed)
      result = receipt(step, {
        noOp: true,
        verification: "passed",
        evidenceDigest: pre.digest,
      });
    else {
      const executed = await limit(
        ports.browser.dispatch(step, argument.value, beforeSideEffect),
      );
      commands = executed.commands;
      result = receipt(step, { dispatch: "dispatched", commands });
      try {
        const observed = await limit(
          ports.browser.observe(step, argument.value),
        );
        result = receipt(step, {
          dispatch: "dispatched",
          commands,
          verification: observed.passed ? "passed" : "failed",
          evidenceDigest: observed.digest,
          error: observed.passed ? null : "POSTCONDITION_FAILED",
        });
      } catch {
        result = receipt(step, {
          dispatch: "dispatched",
          commands,
          verification: "unknown",
          error: "VERIFIER_UNAVAILABLE",
        });
      }
    }
  } catch (error) {
    const progress = error as { commands?: unknown };
    const count =
      typeof progress?.commands === "number" &&
      Number.isInteger(progress.commands)
        ? Math.min(64, Math.max(0, progress.commands))
        : commands;
    result = receipt(step, {
      dispatch: started ? "unknown" : "not_dispatched",
      commands: count,
      error: safeError(error),
    });
  }
  closed = true;
  await ports.journal.settle(id, result);
  return result;
}
