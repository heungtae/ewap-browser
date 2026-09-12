import type { ErrorCode, Mode } from "../contracts/core-types.js";
import { isPlainObject } from "../security/validation.js";
import { ChatRequestLifecycle } from "./chat-request-lifecycle.js";
import {
  exactKeys,
  failureCode,
  type Respond,
  type RoutedMessage,
  type RuntimeSender,
} from "./runtime-message-router.js";

type Payload = { mode: Mode; prompt: string };
type Result = { ok?: boolean };
type Dependencies = {
  activeTab(sender: RuntimeSender): Promise<{ id: number }>;
  cancel(tabId: number): void;
  isPanelSender(sender: RuntimeSender): boolean;
  providerAvailable(): boolean;
  requests: ChatRequestLifecycle;
  runAct(payload: unknown): Promise<Result>;
  runAsk(payload: unknown): Promise<Result>;
  safeFailure(code: string): unknown;
};

const requestId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

const payload = (value: unknown): Payload | undefined => {
  if (!isPlainObject(value) || !exactKeys(value, ["mode", "prompt"])) return;
  if (
    (value.mode !== "ask" && value.mode !== "act") ||
    typeof value.prompt !== "string" ||
    value.prompt.length === 0 ||
    value.prompt.length > 8_000
  )
    return;
  return { mode: value.mode, prompt: value.prompt };
};

export const createChatRequestMessageHandler = (
  dependencies: Dependencies,
) => ({
  handle(
    message: object,
    sender: RuntimeSender,
    respond: Respond,
  ): RoutedMessage {
    const kind = (message as { kind?: unknown }).kind;
    if (kind === "CHAT_REQUEST_START")
      return this.start(message, sender, respond);
    if (kind === "CHAT_REQUEST_STATUS" || kind === "CHAT_REQUEST_CANCEL")
      return this.statusOrCancel(message, sender, respond, kind);
    return { handled: false };
  },
  start(
    message: object,
    sender: RuntimeSender,
    respond: Respond,
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
      .then((active) => {
        const started = dependencies.requests.start({
          request_id: id,
          tab_id: active.id,
          ...input,
        });
        if (started.kind === "conflict") {
          respond(dependencies.safeFailure("REQUEST_ID_CONFLICT"));
          return;
        }
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
            ? dependencies.runAct(input)
            : dependencies.runAsk(input)
        )
          .then((result) =>
            dependencies.requests.finish(
              id,
              generation,
              result.ok ? "VERIFIED" : "FAILED",
              result.ok ? undefined : "PROVIDER_UNAVAILABLE",
            ),
          )
          .catch((error) =>
            dependencies.requests.finish(
              id,
              generation,
              "FAILED",
              failureCode(error, "PROVIDER_PLUGIN_FAILED") as ErrorCode,
            ),
          );
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
        const previous = dependencies.requests.status(id, active.id);
        const snapshot =
          kind === "CHAT_REQUEST_CANCEL"
            ? dependencies.requests.cancel(id, active.id)
            : previous;
        if (!snapshot)
          return respond(dependencies.safeFailure("REQUEST_NOT_FOUND"));
        if (kind === "CHAT_REQUEST_CANCEL" && previous?.state !== "TERMINAL")
          dependencies.cancel(active.id);
        respond({ ok: true, request: snapshot });
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
});
