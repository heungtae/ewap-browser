import type { ChatEventPayload } from "../contracts/chat-events.js";
import {
  migrateApprovalPolicy,
  resolveApproval,
  type ApprovalCategory,
} from "../policy/approval-policy.js";
import {
  defaultAgentPreferences,
  gatePermission,
  type AgentPreferences,
} from "../policy/permission-mode.js";
import type {
  PermissionManager,
  Capability,
} from "../policy/permission-manager.js";
import { fail } from "../security/validation.js";
import { traceDecision } from "../diagnostics/method-trace.js";

let preferences: () => AgentPreferences = defaultAgentPreferences;
let saving = false;
let epoch = 0;
const updates = new Set<symbol>();
let settingsInvalid = false;
export const markApprovalSettingsInvalid = (invalid: boolean): void => {
  settingsInvalid = invalid;
};
export const approvalSettingsInvalid = (): boolean => settingsInvalid;
export const beginApprovalUpdate = (): (() => void) => {
  const id = Symbol();
  updates.add(id);
  epoch++;
  return () => {
    updates.delete(id);
  };
};
let planOrigins: (id: string) => ReadonlySet<string> = () => new Set();
export const configureApprovalRuntime = (
  read: () => AgentPreferences,
  origins?: typeof planOrigins,
): void => {
  preferences = read;
  planOrigins = origins ?? (() => new Set());
};
export const approvalToolPermission = (
  manager: Pick<PermissionManager, "check">,
  capability: Capability,
  origin: string,
  runId: string,
) => {
  assertApprovalAvailable();
  return gatePermission(
    manager,
    preferences(),
    capability,
    origin,
    runId,
    planOrigins(runId),
  );
};
export const approvalSaveBoundary = (blocked: boolean): void => {
  saving = blocked;
  epoch++;
};
export const assertApprovalAvailable = (): void => {
  if (saving || updates.size) fail("POLICY_DENIED");
};
export const approvalEpoch = (): number => epoch;
export const approvalDecision = (
  category: ApprovalCategory,
  value = preferences(),
) => {
  assertApprovalAvailable();
  return resolveApproval(
    value.approval_policy ?? migrateApprovalPolicy(value.permission_mode),
    category,
  );
};
// Grants are closure-local, one-use and never serialized or exposed to the model.
export const createApprovalGrant = (opts: {
  category: ApprovalCategory;
  binding: string;
  current(): boolean;
  preferences?: AgentPreferences;
  source: "user" | "policy";
  record?(
    event: Extract<ChatEventPayload, { type: "approval_decision" }>,
  ): void;
}): (() => void) => {
  const issuedEpoch = epoch;
  const value = opts.preferences ?? preferences();
  const revision = value.approval_policy?.revision ?? 0;
  const decision = approvalDecision(opts.category, value);
  if (
    !opts.current() ||
    decision === "deny" ||
    (opts.source === "policy" && decision !== "auto")
  )
    fail("POLICY_DENIED");
  let consumed = false;
  return () => {
    assertApprovalAvailable();
    if (consumed || issuedEpoch !== epoch || !opts.current())
      fail("POLICY_DENIED");
    consumed = true;
    opts.record?.({
      type: "approval_decision",
      category: opts.category,
      approval_source: opts.source,
      policy_revision: revision,
      outcome: "consumed",
      reason: opts.source === "policy" ? "SETTINGS_AUTO" : "USER_APPROVED",
    });
    traceDecision("approval.consumed", {
      category: opts.category,
      approval_source: opts.source,
      policy_revision: revision,
      outcome: "consumed",
    });
  };
};
