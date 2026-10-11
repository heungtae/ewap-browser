import type { Dependencies } from "./fixture-act-start-types.js";
import {
  approvalDecision,
  createApprovalGrant,
  assertApprovalAvailable,
} from "./approval-runtime.js";
import type { Capability } from "../policy/permission-manager.js";
import { gatePermission } from "../policy/permission-mode.js";
import { ContractError } from "../security/validation.js";
import {
  fixtureProposal,
  fixtureTargetMatches,
} from "./fixture-act-proposal.js";
import type { StartActRequest } from "./start-act-message-handler.js";

export const createFixtureActStart =
  (dependencies: Dependencies) =>
  (request: StartActRequest, respond: (response: unknown) => void): void => {
    void dependencies
      .readActive()
      .then(({ tabId, snapshot, origin }) => {
        assertApprovalAvailable();
        if (
          approvalDecision("action_execution", dependencies.preferences()) ===
          "deny"
        )
          throw new ContractError("POLICY_DENIED");
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
            name: target.name,
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
        const riskDecision = approvalDecision(
          "risk_confirmation",
          dependencies.preferences(),
        );
        if (riskDecision === "deny") throw new ContractError("POLICY_DENIED");
        if (riskDecision === "auto") {
          createApprovalGrant({
            category: "risk_confirmation",
            source: "policy",
            preferences: dependencies.preferences(),
            binding: `${run.id}:${next.confirmationId}`,
            current: () => run.phase === "AWAITING_CONFIRMATION",
          })();
          const ready = dependencies.coordinator.mutations.confirm(
            run,
            next.confirmationId,
            next.confirmationNonce,
          );
          if (binding) dependencies.localSessions.clear(binding.id);
          dependencies.bindings.delete(run.id);
          dependencies.execute(run, ready, respond, origin);
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
