import type { ReadyExecution } from "../state/mutation-coordinator.js";
import type { ActionDefinition } from "../state/mutation-coordinator.js";
import type { Run } from "../state/run-coordinator.js";

type Respond = (response: unknown) => void;
type Dependencies = {
  executeBounded(
    run: Run,
    ready: ReadyExecution,
    origin: string,
  ): Promise<unknown>;
  send(tabId: number, message: unknown): Promise<unknown>;
  terminal(run: Run, state: "VERIFIED" | "FAILED" | "UNKNOWN"): void;
  safeFailure(code: string): unknown;
};

export const localTextDefinition = (
  preStateDigest: string,
): ActionDefinition => ({
  tool: "set_text_by_ref",
  effect: "local-ui-only",
  risk: "R1",
  eligibleRoles: ["textbox"],
  verifier: {
    kind: "semantic-state-transition",
    declaration_id: "local-page-text-v1",
    pre_state_digest: preStateDigest,
    required_changes: [],
  },
});

export const localMutationDefinition = (
  tool: "select_option_by_ref" | "set_checked_by_ref",
  refId: string,
  preStateDigest: string,
  checked?: boolean,
  r2 = false,
): ActionDefinition => ({
  tool,
  effect: r2 ? "server-side" : "local-ui-only",
  risk: r2 ? "R2" : "R1",
  eligibleRoles: tool === "select_option_by_ref" ? ["combobox"] : ["checkbox"],
  verifier: {
    kind: "semantic-state-transition",
    declaration_id:
      tool === "select_option_by_ref"
        ? "local-page-select-v1"
        : "local-page-checkbox-v1",
    pre_state_digest: preStateDigest,
    required_changes:
      tool === "set_checked_by_ref" && typeof checked === "boolean"
        ? [{ ref_id: refId, field: "checked", expected: checked }]
        : [],
  },
});

export const localClickDefinition = (
  preStateDigest: string,
): ActionDefinition => ({
  tool: "click_by_ref",
  effect: "local-ui-only",
  risk: "R1",
  eligibleRoles: ["button"],
  verifier: {
    kind: "semantic-state-transition",
    declaration_id: "local-page-click-v1",
    pre_state_digest: preStateDigest,
    required_changes: [],
  },
});

export const localKeyDefinition = (
  preStateDigest: string,
): ActionDefinition => ({
  tool: "press_key_by_ref",
  effect: "local-ui-only",
  risk: "R1",
  eligibleRoles: ["button", "textbox", "combobox", "tab", "menuitem"],
  verifier: {
    kind: "semantic-state-transition",
    declaration_id: "local-page-key-v1",
    pre_state_digest: preStateDigest,
    required_changes: [],
  },
});

export const createFixtureExecutor =
  (dependencies: Dependencies) =>
  (run: Run, ready: ReadyExecution, respond: Respond, origin: string): void => {
    if (
      ready.intent.tool === "click_by_ref" ||
      ready.intent.tool === "press_key_by_ref"
    ) {
      void dependencies
        .executeBounded(run, ready, origin)
        .then(respond)
        .catch(() => {
          dependencies.terminal(run, "UNKNOWN");
          respond(dependencies.safeFailure("INTERNAL_FAILURE"));
        });
      return;
    }
    void dependencies
      .send(run.tabId, {
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
      })
      .then((result) => {
        if (
          typeof result !== "object" ||
          result === null ||
          !(result as { ok?: unknown }).ok
        ) {
          dependencies.terminal(run, "FAILED");
          const code = (result as { code?: unknown }).code;
          return respond(
            dependencies.safeFailure(
              code === "TARGET_STALE" || code === "VALUE_BINDING_INVALID"
                ? code
                : "TARGET_NOT_ACTIONABLE",
            ),
          );
        }
        if (
          (result as { postcondition?: unknown }).postcondition !== "semantic"
        ) {
          dependencies.terminal(run, "FAILED");
          respond(dependencies.safeFailure("TARGET_NOT_ACTIONABLE"));
          return;
        }
        dependencies.terminal(run, "VERIFIED");
        respond({ ok: true, outcome: "VERIFIED" });
      })
      .catch(() => {
        dependencies.terminal(run, "UNKNOWN");
        respond(dependencies.safeFailure("INTERNAL_FAILURE"));
      });
  };
