import type { ActionIntent } from "../contracts/types.js";
import type {
  BoundedCdpAction,
  BoundedCdpAdapter,
} from "../cdp/bounded-adapter.js";
import type { Capability } from "../policy/permission-manager.js";
import { ContractError } from "../security/validation.js";
import { withDeadline } from "../security/deadline.js";
import type { ReadyExecution } from "../state/mutation-coordinator.js";
import type { Run } from "../state/run-coordinator.js";

type RegisteredDocument = { epoch: string; documentId: string };
type Outcome = "FAILED" | "UNKNOWN" | "VERIFIED";
type PageScope = { document_epoch: string; page_scope_epoch: string };

type Dependencies = {
  beforeDispatch?(tabId: number): Promise<void>;
  boundedCdp: BoundedCdpAdapter | undefined;
  documentFor(tabId: number, frameId: number): RegisteredDocument | undefined;
  isRunActive(runId: string): boolean;
  permitCdp(runId: string): void;
  revokeCdp(runId: string): void;
  createId(): string;
  send(tabId: number, message: unknown): Promise<unknown>;
  tab(tabId: number): Promise<{ url?: string }>;
  scope?(tabId: number): PageScope | undefined;
  terminal(run: Run, outcome: Outcome): void;
  transition(runId: string, phase: "VERIFYING_NAVIGATION"): void;
  milestone?(tabId: number, stage: string): void;
  safeFailure(code: string, detail?: string): Record<string, unknown>;
  verifier: {
    bounded(run: Run, intent: ActionIntent): Promise<boolean>;
    navigationTarget(targetUrl: unknown): string | undefined;
    semantic(run: Run, intent: ActionIntent): Promise<boolean>;
    waitForPageTransition?(
      run: Run,
      beforeUrl: string,
      origin: string,
      expectedUrl?: string,
      beforeScope?: PageScope,
    ): Promise<boolean>;
    waitForSameOriginNavigation(
      tabId: number,
      beforeUrl: string,
      origin: string,
    ): Promise<boolean>;
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
    const beforeUrl =
      tool === "click_by_ref"
        ? await dependencies
            .tab(run.tabId)
            .then((tab) => tab.url)
            .catch(() => undefined)
        : undefined;
    const beforeScope =
      tool === "click_by_ref" ? dependencies.scope?.(run.tabId) : undefined;
    // A click without a declared state transition is undetermined. It may
    // navigate after a transient ARIA change (for example, a custom option
    // closing its listbox), so protect the run before dispatch.
    const undeterminedClick =
      tool === "click_by_ref" &&
      ready.intent.verifier.kind === "semantic-state-transition" &&
      ready.intent.verifier.required_changes.length === 0;
    if (undeterminedClick)
      dependencies.transition(run.id, "VERIFYING_NAVIGATION");
    dependencies.permitCdp(run.id);
    let dispatched = false;
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
      await dependencies.beforeDispatch?.(run.tabId);
      dependencies.milestone?.(run.tabId, "DISPATCH_STARTED");
      if (!dependencies.isRunActive(run.id))
        return dependencies.safeFailure("POLICY_DENIED");
      dispatched = true;
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
      if (undeterminedClick && beforeUrl !== undefined) {
        const navigation = dependencies.verifier.waitForPageTransition
          ? await dependencies.verifier.waitForPageTransition(
              run,
              beforeUrl,
              origin,
              undefined,
              beforeScope,
            )
          : await dependencies.verifier.waitForSameOriginNavigation(
              run.tabId,
              beforeUrl,
              origin,
            );
        const outcome = navigation ? "VERIFIED" : "UNKNOWN";
        dependencies.terminal(run, outcome);
        if (navigation)
          dependencies.milestone?.(run.tabId, "COMPLETION_VERIFIED");
        return navigation
          ? { ok: true, outcome, navigation: true }
          : {
              ...dependencies.safeFailure("POSTCONDITION_UNVERIFIED"),
              outcome,
            };
      }
      const semantic = await dependencies.verifier.semantic(run, ready.intent);
      const bounded = semantic
        ? false
        : await dependencies.verifier.bounded(run, ready.intent);
      const navigation = false;
      const verified = semantic || bounded || navigation;
      const outcome = verified ? "VERIFIED" : "UNKNOWN";
      dependencies.terminal(run, outcome);
      if (verified) dependencies.milestone?.(run.tabId, "COMPLETION_VERIFIED");
      return verified
        ? { ok: true, outcome, ...(navigation ? { navigation: true } : {}) }
        : { ...dependencies.safeFailure("POSTCONDITION_UNVERIFIED"), outcome };
    } catch (error) {
      dependencies.terminal(run, dispatched ? "UNKNOWN" : "FAILED");
      return {
        ...dependencies.safeFailure(
          error instanceof ContractError ? error.code : "CDP_UNAVAILABLE",
        ),
        outcome: dispatched ? "UNKNOWN" : "FAILED",
      };
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
    const beforeUrl =
      ready.intent.tool === "navigate"
        ? await dependencies
            .tab(run.tabId)
            .then((tab) => tab.url)
            .catch(() => undefined)
        : undefined;
    const beforeScope =
      ready.intent.tool === "navigate"
        ? dependencies.scope?.(run.tabId)
        : undefined;
    if (ready.intent.tool === "navigate")
      dependencies.transition(run.id, "VERIFYING_NAVIGATION");
    await dependencies.beforeDispatch?.(run.tabId);
    dependencies.milestone?.(run.tabId, "DISPATCH_STARTED");
    if (!dependencies.isRunActive(run.id))
      return dependencies.safeFailure("POLICY_DENIED");
    let result: unknown;
    try {
      result = await withDeadline(
        dependencies.send(run.tabId, {
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
        }),
        15_000,
        "POSTCONDITION_UNVERIFIED",
      );
    } catch {
      dependencies.terminal(run, "UNKNOWN");
      return {
        ...dependencies.safeFailure("POSTCONDITION_UNVERIFIED"),
        outcome: "UNKNOWN",
      };
    }
    if (!dependencies.isRunActive(run.id))
      return {
        ...dependencies.safeFailure("POSTCONDITION_UNVERIFIED"),
        outcome: "UNKNOWN",
      };
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
      const atExpectedUrl = await dependencies.verifier.waitForNavigation(
        run.tabId,
        expectedUrl,
      );
      const verified =
        atExpectedUrl &&
        (!beforeUrl || !dependencies.verifier.waitForPageTransition
          ? true
          : await dependencies.verifier.waitForPageTransition(
              run,
              beforeUrl,
              new URL(expectedUrl).origin,
              expectedUrl,
              beforeScope,
            ));
      const outcome = verified ? "VERIFIED" : "UNKNOWN";
      dependencies.terminal(run, outcome);
      if (verified) dependencies.milestone?.(run.tabId, "COMPLETION_VERIFIED");
      return verified
        ? { ok: true, outcome }
        : { ...dependencies.safeFailure("NAVIGATION_UNVERIFIED"), outcome };
    }
    if (
      postcondition === "semantic" ||
      (postcondition === "exact_option_value" &&
        ready.intent.tool === "select_option_by_ref")
    ) {
      dependencies.terminal(run, "VERIFIED");
      dependencies.milestone?.(run.tabId, "COMPLETION_VERIFIED");
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
