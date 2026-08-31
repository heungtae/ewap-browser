import { ContractError } from "../security/validation.js";
import type {
  LocalFixtureSessionBinding,
  SessionBinding,
} from "../state/local-session-binding.js";
import type { ServiceCoordinator } from "./coordinator.js";
import {
  createMutationExecutionMessageHandler,
  type ActionValuePayload,
} from "./mutation-execution-message-handler.js";
import type { BrowserChromeApi, BrowserSender } from "./browser-api.js";

type Dependencies = {
  chrome: BrowserChromeApi;
  isPanelSender(sender: BrowserSender): boolean;
  coordinator: ServiceCoordinator;
  bindings: Map<string, SessionBinding>;
  localSessions: LocalFixtureSessionBinding;
  execute(
    run: Parameters<ServiceCoordinator["mutations"]["executeR1"]>[0],
    ready: ReturnType<ServiceCoordinator["mutations"]["executeR1"]>,
    respond: (response: unknown) => void,
    origin: string,
  ): void;
  pageOrigin(url: string | undefined): string;
  safeFailure(code: string): unknown;
};

export const createFixtureMutationMessageHandler = (
  dependencies: Dependencies,
) =>
  createMutationExecutionMessageHandler({
    isPanelSender: dependencies.isPanelSender,
    submitValue(payload: ActionValuePayload, respond) {
      void dependencies.chrome.tabs
        .query({ active: true, lastFocusedWindow: true })
        .then((tabs) => {
          const tabId = tabs[0]?.id;
          const run =
            tabId === undefined
              ? undefined
              : dependencies.coordinator.runs.get(tabId);
          if (!run || run.id !== payload.run_id || run.phase === "TERMINAL")
            return respond(dependencies.safeFailure("VALUE_BINDING_INVALID"));
          try {
            dependencies.coordinator.mutations.submitValue(
              run,
              payload.value_slot_id,
              payload.value,
            );
            const ready = dependencies.coordinator.mutations.executeR1(run);
            if (
              ready.value === undefined ||
              !ready.intent.value_binding ||
              ready.intent.value_binding.value_kind !== payload.value_kind
            )
              return respond(dependencies.safeFailure("VALUE_BINDING_INVALID"));
            dependencies.execute(
              run,
              ready,
              respond,
              dependencies.pageOrigin(tabs[0]?.url),
            );
          } catch (error) {
            dependencies.coordinator.mutations.terminal(run, "FAILED");
            respond(
              dependencies.safeFailure(
                error instanceof ContractError
                  ? error.code
                  : "VALUE_BINDING_INVALID",
              ),
            );
          }
        })
        .catch(() => respond(dependencies.safeFailure("INTERNAL_FAILURE")));
    },
    confirm(payload, respond) {
      void dependencies.chrome.tabs
        .query({ active: true, lastFocusedWindow: true })
        .then((tabs) => {
          const tabId = tabs[0]?.id;
          const run =
            tabId === undefined
              ? undefined
              : dependencies.coordinator.runs.get(tabId);
          const binding = run ? dependencies.bindings.get(run.id) : undefined;
          if (
            !run ||
            run.id !== payload.run_id ||
            run.phase !== "AWAITING_CONFIRMATION" ||
            !binding
          )
            return respond(dependencies.safeFailure("CONFIRMATION_INVALID"));
          try {
            dependencies.localSessions.verify(
              binding,
              run.id,
              run.documentEpoch,
            );
            const ready = dependencies.coordinator.mutations.confirm(
              run,
              payload.confirmation_id,
              payload.confirmation_nonce,
            );
            dependencies.localSessions.clear(binding.id);
            dependencies.bindings.delete(run.id);
            dependencies.execute(
              run,
              ready,
              respond,
              dependencies.pageOrigin(tabs[0]?.url),
            );
          } catch (error) {
            dependencies.localSessions.clear(binding.id);
            dependencies.bindings.delete(run.id);
            dependencies.coordinator.mutations.terminal(run, "FAILED");
            respond(
              dependencies.safeFailure(
                error instanceof ContractError
                  ? error.code
                  : "CONFIRMATION_INVALID",
              ),
            );
          }
        })
        .catch(() => respond(dependencies.safeFailure("INTERNAL_FAILURE")));
    },
    safeFailure: dependencies.safeFailure,
  });
