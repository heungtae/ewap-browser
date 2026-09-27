import type { Risk } from "../contracts/types.js";
import type { Capability } from "../policy/permission-manager.js";
import type {
  EnterprisePolicyDecision,
  EnterprisePolicyRequest,
} from "../policy/enterprise-policy.js";
import type { AuditEvent } from "../security/audit.js";
import { sha256 } from "../security/canonical.js";
import { ContractError, fail } from "../security/validation.js";
import type { Run } from "../state/run-coordinator.js";
import type { ActSession } from "./act-session-types.js";

type Dependencies = {
  session: ActSession;
  run: Run;
  capability: Exclude<Capability, "collection_read">;
  risk: Risk;
  authorizeEnterprise(
    request: EnterprisePolicyRequest,
  ): Promise<EnterprisePolicyDecision>;
  evidence(event: AuditEvent): Promise<unknown>;
};

export const authorizeActWithEvidence = async (
  dependencies: Dependencies,
): Promise<EnterprisePolicyDecision> => {
  const { session, run, capability, risk } = dependencies;
  const audit = {
    event: "policy" as const,
    run_id: run.id,
    origin: session.origin,
    profile_id: sha256(`profile:${session.profile.id}`),
    profile_version: session.profile.version,
    ...(session.workflow
      ? { workflow_id: sha256(`workflow:${session.workflow.declaration.id}`) }
      : {}),
    capability,
    risk,
  };
  let decision: EnterprisePolicyDecision;
  try {
    decision = await dependencies.authorizeEnterprise({
      run_id: run.id,
      tab_id: run.tabId,
      document_epoch: run.documentEpoch,
      origin: session.origin,
      capability,
      risk,
      profile: session.profile,
    });
  } catch (error) {
    const code =
      error instanceof ContractError
        ? error.code
        : "ENTERPRISE_POLICY_UNAVAILABLE";
    void dependencies
      .evidence({
        ...audit,
        code,
        ...(code === "ENTERPRISE_POLICY_DENIED"
          ? { decision: "DENY" as const }
          : {}),
        stage: "requested",
      })
      .catch(() => undefined);
    throw error;
  }
  void dependencies
    .evidence({
      ...audit,
      decision: decision.decision,
      stage: decision.decision === "ALLOW" ? "authorized" : "requested",
    })
    .catch(() => undefined);
  if (decision.decision !== "ALLOW") return fail("ENTERPRISE_POLICY_DENIED");
  return decision;
};
