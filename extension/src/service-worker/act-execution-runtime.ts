import type { ActionIntent } from "../contracts/types.js";
import type {
  BoundedCdpAction,
  BoundedCdpAdapter,
} from "../cdp/bounded-adapter.js";
import type { Capability } from "../policy/permission-manager.js";
import { ContractError } from "../security/validation.js";
import type { ReadyExecution } from "../state/mutation-coordinator.js";
import type { Run } from "../state/run-coordinator.js";

type RegisteredDocument = { epoch: string; documentId: string };
type Outcome = "FAILED" | "UNKNOWN" | "VERIFIED";

type Dependencies = {
  boundedCdp: BoundedCdpAdapter | undefined;
  documentFor(tabId: number, frameId: number): RegisteredDocument | undefined;
  isRunActive(runId: string): boolean;
  permitCdp(runId: string): void;
  revokeCdp(runId: string): void;
  createId(): string;
  send(tabId: number, message: unknown): Promise<unknown>;
  terminal(run: Run, outcome: Outcome): void;
  transition(runId: string, phase: "VERIFYING_NAVIGATION"): void;
  safeFailure(code: string, detail?: string): Record<string, unknown>;
  verifier: {
    bounded(run: Run, intent: ActionIntent): Promise<boolean>;
    navigationTarget(targetUrl: unknown): string | undefined;
    semantic(run: Run, intent: ActionIntent): Promise<boolean>;
    waitForNavigation(tabId: number, expected: string): Promise<boolean>;
  };
};

const cdpTools = new Set([
  "click_by_ref",
  "press_key_by_ref",
  "set_text_by_ref",
]);

export const createActExecutionRuntime = (dependencies: Dependencies) => {
  const executeBounded = async (
    run: Run,
    ready: ReadyExecution,
    origin: string,
  ): Promise<Record<string, unknown>> => {
    if (!dependencies.boundedCdp)
      return dependencies.safeFailure("CDP_UNAVAILABLE");
    const document = dependencies.documentFor(run.tabId, run.frameId);
    if (!document || document.epoch !== run.documentEpoch)
      return dependencies.safeFailure("DOCUMENT_NOT_REGISTERED");
    if (!cdpTools.has(ready.intent.tool))
      return dependencies.safeFailure("CDP_COMMAND_NOT_ALLOWED");
    const tool = ready.intent.tool as BoundedCdpAction["tool"];
    const capability: Capability =
      tool === "set_text_by_ref" ? "type" : "click";
    const action: BoundedCdpAction = {
      runId: run.id,
      actionId: dependencies.createId(),
      tabId: run.tabId,
      frameId: run.frameId,
      documentId: document.documentId,
      documentEpoch: run.documentEpoch,
      refId: ready.intent.ref_id,
      tool,
      risk: ready.intent.risk,
      actionToken: dependencies.createId(),
      origin,
      capability,
    };
    dependencies.permitCdp(run.id);
    try {
      let input: { key?: string; text?: string } | undefined;
      if (tool === "press_key_by_ref") {
        const key = ready.intent.argument?.key;
        if (!key) throw new ContractError("CDP_COMMAND_NOT_ALLOWED");
        input = { key };
      }
      if (tool === "set_text_by_ref") {
        if (ready.value === undefined)
          throw new ContractError("VALUE_BINDING_INVALID");
        input = { text: ready.value };
      }
      const execution = await dependencies.boundedCdp.execute(action, input);
      if (execution.outcome !== "DISPATCHED") {
        const outcome = execution.outcome === "UNKNOWN" ? "UNKNOWN" : "FAILED";
        dependencies.terminal(run, outcome);
        return {
          ...dependencies.safeFailure(
            outcome === "UNKNOWN"
              ? "POSTCONDITION_UNVERIFIED"
              : "TARGET_NOT_ACTIONABLE",
          ),
          outcome,
        };
      }
      if (!dependencies.isRunActive(run.id))
        return dependencies.safeFailure("POLICY_DENIED", "run cancelled");
      const verified =
        (await dependencies.verifier.semantic(run, ready.intent)) ||
        (await dependencies.verifier.bounded(run, ready.intent));
      const outcome = verified ? "VERIFIED" : "UNKNOWN";
      dependencies.terminal(run, outcome);
      return verified
        ? { ok: true, outcome }
        : { ...dependencies.safeFailure("POSTCONDITION_UNVERIFIED"), outcome };
    } catch (error) {
      dependencies.terminal(run, "FAILED");
      return dependencies.safeFailure(
        error instanceof ContractError ? error.code : "CDP_UNAVAILABLE",
      );
    } finally {
      dependencies.revokeCdp(run.id);
    }
  };

  const executeContent = async (
    run: Run,
    ready: ReadyExecution,
    origin: string,
  ): Promise<Record<string, unknown>> => {
    if (cdpTools.has(ready.intent.tool))
      return executeBounded(run, ready, origin);
    if (ready.intent.tool === "navigate")
      dependencies.transition(run.id, "VERIFYING_NAVIGATION");
    const result = await dependencies.send(run.tabId, {
      kind: "CONTENT_EXECUTE_R1",
      intent: ready.intent,
      ...(ready.value !== undefined && ready.intent.value_binding
        ? {
            value_delivery: {
              value_slot_id: ready.intent.value_binding.value_slot_id,
              value_kind: ready.intent.value_binding.value_kind,
              value: ready.value,
            },
          }
        : {}),
    });
    if (
      typeof result !== "object" ||
      result === null ||
      !(result as { ok?: unknown }).ok
    ) {
      dependencies.terminal(run, "FAILED");
      const code = (result as { code?: unknown }).code;
      return dependencies.safeFailure(
        code === "TARGET_STALE" || code === "VALUE_BINDING_INVALID"
          ? code
          : "TARGET_NOT_ACTIONABLE",
      );
    }
    const postcondition = (result as { postcondition?: unknown }).postcondition;
    if (postcondition === "navigation") {
      const expectedUrl = dependencies.verifier.navigationTarget(
        (result as { target_url?: unknown }).target_url,
      );
      if (!expectedUrl) {
        dependencies.terminal(run, "FAILED");
        return dependencies.safeFailure("TARGET_NOT_ACTIONABLE");
      }
      const verified = await dependencies.verifier.waitForNavigation(
        run.tabId,
        expectedUrl,
      );
      const outcome = verified ? "VERIFIED" : "UNKNOWN";
      dependencies.terminal(run, outcome);
      return verified
        ? { ok: true, outcome }
        : { ...dependencies.safeFailure("NAVIGATION_UNVERIFIED"), outcome };
    }
    if (postcondition === "semantic") {
      dependencies.terminal(run, "VERIFIED");
      return { ok: true, outcome: "VERIFIED" };
    }
    const verified = await dependencies.verifier.semantic(run, ready.intent);
    dependencies.terminal(run, verified ? "VERIFIED" : "FAILED");
    return verified
      ? { ok: true, outcome: "VERIFIED" }
      : dependencies.safeFailure("TARGET_NOT_ACTIONABLE");
  };

  return { executeBounded, executeContent };
};
