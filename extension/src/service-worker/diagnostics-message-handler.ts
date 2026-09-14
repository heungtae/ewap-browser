import type { DiagnosticsLevel } from "./execution-diagnostics.js";
import {
  requestId,
  type Dependencies,
} from "./request-message-dependencies.js";
import {
  exactKeys,
  failureCode,
  type RuntimeSender,
  type Respond,
  type RoutedMessage,
} from "./runtime-message-router.js";
export const createDiagnosticsMessageHandler = (
  dependencies: Dependencies,
) => ({
  diagnostics(
    message: object,
    sender: RuntimeSender,
    respond: Respond,
    kind: "DIAGNOSTICS_LIST" | "DIAGNOSTICS_CLEAR",
  ): RoutedMessage {
    const id = (message as { request_id?: unknown }).request_id;
    const list = kind === "DIAGNOSTICS_LIST";
    const after = (message as { after_sequence?: unknown }).after_sequence;
    const limit = (message as { limit?: unknown }).limit;
    const keys = list
      ? ["schema_version", "kind", "request_id", "after_sequence", "limit"]
      : ["schema_version", "kind", "request_id"];
    if (
      !dependencies.isPanelSender(sender) ||
      !exactKeys(message, keys) ||
      (message as { schema_version?: unknown }).schema_version !== 1 ||
      !requestId(id) ||
      (list &&
        (!Number.isInteger(after) ||
          (after as number) < 0 ||
          !Number.isInteger(limit) ||
          (limit as number) < 1 ||
          (limit as number) > 100))
    ) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    void dependencies
      .activeTab(sender)
      .then((active) => {
        if (
          !dependencies.requests.status(
            id,
            active.id,
            (sender.documentId ?? "") +
              (active.epoch ? ":" + active.epoch : ""),
          )
        ) {
          respond(dependencies.safeFailure("REQUEST_NOT_FOUND"));
          return;
        }
        if (list) {
          const result = dependencies.diagnostics?.list(
            id,
            active.id,
            after as number,
            limit as number,
          );
          respond(
            result
              ? { ok: true, ...result }
              : dependencies.safeFailure("REQUEST_NOT_FOUND"),
          );
        } else {
          respond(
            dependencies.diagnostics?.clear(id, active.id)
              ? { ok: true }
              : dependencies.safeFailure("REQUEST_NOT_FOUND"),
          );
        }
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
  settings(
    message: object,
    sender: RuntimeSender,
    respond: Respond,
  ): RoutedMessage {
    const level = (message as { level?: unknown }).level;
    if (
      !dependencies.isPanelSender(sender) ||
      !exactKeys(message, ["schema_version", "kind", "level"]) ||
      (message as { schema_version?: unknown }).schema_version !== 1 ||
      (level !== "off" && level !== "basic" && level !== "debug")
    ) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    if (!dependencies.diagnostics) {
      respond(dependencies.safeFailure("STORAGE_BOUNDARY_UNAVAILABLE"));
      return { handled: true };
    }
    respond({
      ok: true,
      level: dependencies.diagnostics.setLevel(level as DiagnosticsLevel),
    });
    return { handled: true };
  },
});
