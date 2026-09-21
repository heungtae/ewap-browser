import type { ErrorCode } from "../contracts/core-types.js";
import {
  payload,
  requestId,
  type Dependencies,
} from "./request-message-dependencies.js";
import { createDiagnosticsMessageHandler } from "./diagnostics-message-handler.js";
import {
  exactKeys,
  failureCode,
  type RuntimeSender,
  type Respond,
  type RoutedMessage,
} from "./runtime-message-router.js";
export const createChatRequestMessageHandler = (dependencies: Dependencies) => {
  const diagnosticsHandler = createDiagnosticsMessageHandler(dependencies);
  return {
    handle(
      message: object,
      sender: RuntimeSender,
      respond: Respond,
    ): RoutedMessage {
      const kind = (message as { kind?: unknown }).kind;
      if (kind === "CHAT_SEND") {
        if (!exactKeys(message, ["kind", "payload"])) {
          respond(dependencies.safeFailure("INVALID_ARGUMENT"));
          return { handled: true };
        }
        return this.start(
          {
            schema_version: 1,
            kind: "CHAT_REQUEST_START",
            request_id: crypto.randomUUID(),
            payload: (message as { payload?: unknown }).payload,
          },
          sender,
          respond,
          true,
        );
      }
      if (kind === "CHAT_REQUEST_START")
        return this.start(message, sender, respond);
      if (kind === "CHAT_REQUEST_STATUS" || kind === "CHAT_REQUEST_CANCEL")
        return this.statusOrCancel(message, sender, respond, kind);
      if (kind === "DIAGNOSTICS_LIST" || kind === "DIAGNOSTICS_CLEAR")
        return diagnosticsHandler.diagnostics(message, sender, respond, kind);
      if (kind === "DIAGNOSTICS_SETTINGS_SET")
        return diagnosticsHandler.settings(message, sender, respond);
      if (kind === "DIAGNOSTICS_BUNDLE_EXPORT")
        return diagnosticsHandler.bundleExport(message, sender, respond);
      return { handled: false };
    },
    start(
      message: object,
      sender: RuntimeSender,
      respond: Respond,
      legacy = false,
    ): RoutedMessage {
      const id = (message as { request_id?: unknown }).request_id;
      const input = payload((message as { payload?: unknown }).payload);
      if (
        !dependencies.isPanelSender(sender) ||
        !exactKeys(message, [
          "schema_version",
          "kind",
          "request_id",
          "payload",
        ]) ||
        (message as { schema_version?: unknown }).schema_version !== 1 ||
        !requestId(id) ||
        !input ||
        !dependencies.providerAvailable()
      ) {
        respond(dependencies.safeFailure("INVALID_ARGUMENT"));
        return { handled: true };
      }
      void dependencies
        .activeTab(sender)
        .then(async (active) => {
          const started = dependencies.requests.start({
            request_id: id,
            tab_id: active.id,
            // Page epoch deliberately changes during a verified navigation.
            // The authenticated side-panel document and bound tab are the
            // request owner; tying ownership to the page epoch makes the same
            // panel lose status/cancel access immediately after navigation.
            owner: sender.documentId ?? "",
            ...input,
          });
          if (started.kind === "conflict") {
            respond(dependencies.safeFailure("REQUEST_ID_CONFLICT"));
            return;
          }
          try {
            await dependencies.requests.flush();
          } catch {
            dependencies.requests.cancel(
              id,
              active.id,
              sender.documentId ?? "",
              "storage_flush_failed",
              "FAILED",
              "STORAGE_BOUNDARY_UNAVAILABLE",
            );
            respond(dependencies.safeFailure("STORAGE_BOUNDARY_UNAVAILABLE"));
            return;
          }
          if (!legacy)
            respond({
              ok: true,
              accepted: true,
              request_id: id,
              revision: started.snapshot.revision,
            });
          if (started.kind !== "accepted") return;
          const generation = dependencies.requests.startRun(id);
          if (generation === undefined) return;
          void (
            input.mode === "act"
              ? dependencies.runAct(input, dependencies.requests.context(id))
              : dependencies.runAsk(input, dependencies.requests.context(id))
          )
            .then((result) => {
              dependencies.requests.settled(id, generation, result);
              if (legacy) respond(result);
            })
            .catch((error) => {
              dependencies.requests.finish(
                id,
                generation,
                "FAILED",
                failureCode(error, "PROVIDER_PLUGIN_FAILED") as ErrorCode,
              );
              if (legacy)
                respond(
                  dependencies.safeFailure(
                    failureCode(error, "PROVIDER_PLUGIN_FAILED"),
                  ),
                );
            });
        })
        .catch((error) =>
          respond(
            dependencies.safeFailure(
              failureCode(error, "PANEL_CONTEXT_UNAVAILABLE"),
            ),
          ),
        );
      return { handled: true, keepAlive: true };
    },
    statusOrCancel(
      message: object,
      sender: RuntimeSender,
      respond: Respond,
      kind: "CHAT_REQUEST_STATUS" | "CHAT_REQUEST_CANCEL",
    ): RoutedMessage {
      const id = (message as { request_id?: unknown }).request_id;
      if (
        !dependencies.isPanelSender(sender) ||
        !exactKeys(message, ["schema_version", "kind", "request_id"]) ||
        (message as { schema_version?: unknown }).schema_version !== 1 ||
        !requestId(id)
      ) {
        respond(dependencies.safeFailure("INVALID_ARGUMENT"));
        return { handled: true };
      }
      void dependencies
        .activeTab(sender)
        .then((active) => {
          const owner = sender.documentId ?? "";
          const previous = dependencies.requests.status(id, active.id, owner);
          if (kind === "CHAT_REQUEST_CANCEL" && previous)
            dependencies.diagnostics?.cancelRequested(id);
          const snapshot =
            kind === "CHAT_REQUEST_CANCEL"
              ? dependencies.requests.cancel(id, active.id, owner, "panel_stop")
              : previous;
          if (!snapshot)
            return respond(dependencies.safeFailure("REQUEST_NOT_FOUND"));
          if (kind === "CHAT_REQUEST_CANCEL" && previous?.state !== "TERMINAL")
            dependencies.cancel(active.id);
          respond({
            ok: true,
            request: snapshot,
            ...(dependencies.requests.result(id)
              ? { result: dependencies.requests.result(id) }
              : {}),
          });
        })
        .catch((error) =>
          respond(
            dependencies.safeFailure(
              failureCode(error, "PANEL_CONTEXT_UNAVAILABLE"),
            ),
          ),
        );
      return { handled: true, keepAlive: true };
    },
  };
};
