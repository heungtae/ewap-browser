import { ContractError } from "../security/validation.js";
import type {
  Capability,
  PermissionDecision,
} from "../policy/permission-manager.js";
import { exactKeys } from "./runtime-message-router.js";
import type { BrowserSender } from "./browser-api.js";

type Respond = (response: unknown) => void;
type PermissionRequest = {
  capability: Capability;
  origin: string;
  expiresAt: number;
  act_session_id?: string;
};
type Dependencies = {
  isPanelSender(sender: BrowserSender): boolean;
  cancelActiveRun(): Promise<boolean>;
  permissionRequest(id: string): PermissionRequest | undefined;
  decidePermission(
    request: PermissionRequest,
    requestId: string,
    decision: PermissionDecision,
  ): void;
  persistPermissions(): Promise<void>;
  approvePlan(runId: string, origins: string[]): unknown;
  safeFailure(code: string): unknown;
};

const failureCode = (error: unknown): string =>
  error instanceof ContractError ? error.code : "INVALID_ARGUMENT";

export const createRunControlMessageHandler = (dependencies: Dependencies) => ({
  handle(
    message: object,
    sender: BrowserSender,
    respond: Respond,
  ): { handled: boolean; keepAlive?: boolean } {
    const kind = (message as { kind?: unknown }).kind;
    if (kind === "CANCEL") {
      if (
        !dependencies.isPanelSender(sender) ||
        !exactKeys(message, ["kind"])
      ) {
        respond(dependencies.safeFailure("INVALID_ARGUMENT"));
        return { handled: true };
      }
      void dependencies
        .cancelActiveRun()
        .then((cancelled) =>
          respond(
            cancelled
              ? { ok: true, outcome: "CANCELLED" }
              : dependencies.safeFailure("INVALID_ARGUMENT"),
          ),
        )
        .catch(() => respond(dependencies.safeFailure("INTERNAL_FAILURE")));
      return { handled: true, keepAlive: true };
    }
    if (kind === "PERMISSION_DECISION") {
      const requestId = (message as { permission_request_id?: unknown })
        .permission_request_id;
      const decision = (message as { decision?: unknown }).decision;
      const request =
        typeof requestId === "string"
          ? dependencies.permissionRequest(requestId)
          : undefined;
      if (
        !dependencies.isPanelSender(sender) ||
        !exactKeys(message, ["kind", "permission_request_id", "decision"]) ||
        typeof requestId !== "string" ||
        !request ||
        request.expiresAt < Date.now() ||
        !["once", "always", "deny"].includes(decision as string)
      ) {
        respond(dependencies.safeFailure("INVALID_ARGUMENT"));
        return { handled: true };
      }
      try {
        dependencies.decidePermission(
          request,
          requestId,
          decision as PermissionDecision,
        );
      } catch (error) {
        respond(dependencies.safeFailure(failureCode(error)));
        return { handled: true };
      }
      void dependencies
        .persistPermissions()
        .then(() => respond({ ok: true }))
        .catch(() =>
          respond(dependencies.safeFailure("STORAGE_BOUNDARY_UNAVAILABLE")),
        );
      return { handled: true, keepAlive: true };
    }
    if (kind !== "PLAN_APPROVE") return { handled: false };
    const runId = (message as { run_id?: unknown }).run_id;
    const origins = (message as { origins?: unknown }).origins;
    if (
      !dependencies.isPanelSender(sender) ||
      !exactKeys(message, ["kind", "run_id", "origins"]) ||
      typeof runId !== "string" ||
      !Array.isArray(origins) ||
      origins.some((origin) => typeof origin !== "string")
    ) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    try {
      respond({ ok: true, plan: dependencies.approvePlan(runId, origins) });
    } catch (error) {
      respond(dependencies.safeFailure(failureCode(error)));
    }
    return { handled: true };
  },
});
