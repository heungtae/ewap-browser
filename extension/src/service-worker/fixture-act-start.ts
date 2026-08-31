import type { Capability } from "../policy/permission-manager.js";
import {
  gatePermission,
  type AgentPreferences,
} from "../policy/permission-mode.js";
import type { PermissionManager } from "../policy/permission-manager.js";
import type { SemanticNode } from "../contracts/types.js";
import { ContractError } from "../security/validation.js";
import type {
  LocalFixtureSessionBinding,
  SessionBinding,
} from "../state/local-session-binding.js";
import type { ServiceCoordinator } from "./coordinator.js";
import {
  fixtureProposal,
  fixtureTargetMatches,
} from "./fixture-act-proposal.js";
import type { StartActRequest } from "./start-act-message-handler.js";

type PermissionRequest = {
  capability: Capability;
  origin: string;
  expiresAt: number;
  act_session_id?: string;
};
type Active = {
  tabId: number;
  origin: string;
  snapshot: {
    document_epoch: string;
    nodes: SemanticNode[];
  };
};
type Dependencies = {
  readActive(): Promise<Active>;
  preferences(): AgentPreferences;
  permissions: PermissionManager;
  requests: Map<string, PermissionRequest>;
  createId(): string;
  coordinator: ServiceCoordinator;
  bindings: Map<string, SessionBinding>;
  localSessions: LocalFixtureSessionBinding;
  profile: { id: string; version: number };
  execute(
    run: Parameters<ServiceCoordinator["mutations"]["executeR1"]>[0],
    ready: ReturnType<ServiceCoordinator["mutations"]["executeR1"]>,
    respond: (response: unknown) => void,
    origin: string,
  ): void;
  safeFailure(code: string): unknown;
};

export const createFixtureActStart =
  (dependencies: Dependencies) =>
  (request: StartActRequest, respond: (response: unknown) => void): void => {
    void dependencies
      .readActive()
      .then(({ tabId, snapshot, origin }) => {
        const capability: Capability =
          request.tool === "set_checked_by_ref" ||
          request.tool === "click_by_ref" ||
          request.tool === "press_key_by_ref"
            ? "click"
            : "type";
        const grantKey = request.permissionRequestId ?? `direct-${tabId}`;
        const permission = gatePermission(
          dependencies.permissions,
          dependencies.preferences(),
          capability,
          origin,
          grantKey,
        );
        if (permission !== "ALLOW") {
          if (permission === "DENY" || permission === "PLAN_SCOPE_VIOLATION") {
            respond(dependencies.safeFailure("POLICY_DENIED"));
            return;
          }
          const requestId = dependencies.createId();
          dependencies.requests.set(requestId, {
            capability,
            origin,
            expiresAt: Date.now() + 60_000,
          });
          respond({
            ok: true,
            state: "PERMISSION_REQUIRED",
            permission_request_id: requestId,
            capability,
            host: new URL(origin).hostname,
          });
          return;
        }
        if (request.permissionRequestId) {
          dependencies.requests.delete(request.permissionRequestId);
          dependencies.permissions.endRun(request.permissionRequestId);
        }
        const target = snapshot.nodes.find(
          (node) => node.ref_id === request.refId,
        );
        if (!fixtureTargetMatches(request, target)) {
          respond(dependencies.safeFailure("TARGET_NOT_ACTIONABLE"));
          return;
        }
        const previous = dependencies.coordinator.runs.get(tabId);
        if (previous) {
          const binding = dependencies.bindings.get(previous.id);
          if (binding) dependencies.localSessions.clear(binding.id);
          dependencies.bindings.delete(previous.id);
        }
        dependencies.coordinator.cancel(tabId);
        const run = dependencies.coordinator.runs.start(
          tabId,
          0,
          snapshot.document_epoch,
          "act",
        );
        const fixture = fixtureProposal(request, target);
        const binding = fixture.requiresConfirmation
          ? dependencies.localSessions.issue(run.id, run.documentEpoch)
          : undefined;
        if (binding) dependencies.bindings.set(run.id, binding);
        const next = dependencies.coordinator.mutations.propose(
          run,
          fixture.proposal,
          {
            refId: request.refId,
            role: target.role,
            visible: target.visible,
            enabled: target.enabled,
            sensitive: false,
            stale: false,
          },
          dependencies.profile,
          fixture.definition,
          binding?.id,
        );
        if (next.state === "AWAITING_VALUE") {
          respond({
            ok: true,
            state: next.state,
            run_id: run.id,
            value_slot_id: next.valueSlotId,
            value_kind: next.valueKind,
          });
          return;
        }
        if (next.state === "READY_TO_EXECUTE") {
          dependencies.execute(
            run,
            dependencies.coordinator.mutations.executeR1(run),
            respond,
            origin,
          );
          return;
        }
        respond({
          ok: true,
          state: next.state,
          run_id: run.id,
          confirmation_id: next.confirmationId,
          confirmation_nonce: next.confirmationNonce,
        });
      })
      .catch((error) =>
        respond(
          dependencies.safeFailure(
            error instanceof ContractError ? error.code : "ORIGIN_NOT_ALLOWED",
          ),
        ),
      );
  };
