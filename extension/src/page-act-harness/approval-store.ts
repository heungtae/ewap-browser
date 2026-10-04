import {
  traceBranch,
  traceDecision,
  traceMethod,
} from "../diagnostics/method-trace.js";
import { isOpaqueId } from "./contracts.js";

export type Approval = {
  approval_id: string;
  plan_id: string;
  plan_revision: number;
  request_revision: number;
  scope: string;
  used: boolean;
  revoked?: boolean;
  // Value binding is never part of an approval: propose_set_text-style
  // values bind in the user input UI, never via provider-passed values here.
  value_binding: "none";
};

export const grantApproval = (opts: {
  approval_id: string;
  plan_id: string;
  plan_revision: number;
  request_revision: number;
  scope: string;
}): Approval =>
  traceMethod(
    "page-act-harness/approval-store.ts:grantApproval",
    { plan_revision: opts.plan_revision },
    () => {
      if (!isOpaqueId(opts.approval_id)) throw new Error("APPROVAL_ID_INVALID");
      if (!isOpaqueId(opts.plan_id)) throw new Error("PLAN_ID_INVALID");
      const approval: Approval = {
        ...opts,
        used: false,
        value_binding: "none",
      };
      traceDecision("page-act-harness.approval.granted", {
        approval_id: opts.approval_id,
        plan_id: opts.plan_id,
        plan_revision: opts.plan_revision,
        request_revision: opts.request_revision,
        scope: opts.scope,
      });
      return approval;
    },
  );

export const consumeApproval = (
  approval: Approval,
  expected: {
    plan_id: string;
    plan_revision: number;
    request_revision: number;
    binding_current: boolean;
  },
): Approval =>
  traceMethod(
    "page-act-harness/approval-store.ts:consumeApproval",
    { plan_revision: expected.plan_revision },
    (context) => {
      const method = "page-act-harness/approval-store.ts:consumeApproval";
      const fail = (code: string, condition: string): never => {
        traceBranch(context, method, "fail", code, condition);
        throw new Error(code);
      };
      if (approval.revoked === true)
        fail("APPROVAL_REVOKED", "stop/restart discarded this approval");
      if (approval.used)
        fail("APPROVAL_REUSED", "approvals are single-use nonces");
      if (approval.plan_id !== expected.plan_id)
        fail("PLAN_ID_MISMATCH", "approval bound to a different plan");
      if (approval.plan_revision !== expected.plan_revision)
        fail("PLAN_REVISION_CHANGED", "plan diff needs re-approval");
      if (approval.request_revision !== expected.request_revision)
        fail("REQUEST_REVISION_CHANGED", "goal change needs a new revision");
      // binding_current must come from a fresh preflight observation, not a
      // cached flag: stale targets are re-resolved before dispatch.
      if (!expected.binding_current)
        fail("STALE_BINDING", "page changed after approval");
      traceDecision("page-act-harness.approval.consumed", {
        approval_id: approval.approval_id,
        plan_id: approval.plan_id,
        plan_revision: expected.plan_revision,
        request_revision: expected.request_revision,
      });
      return { ...approval, used: true };
    },
  );

export const revokeApproval = (approval: Approval, reason: string): Approval =>
  traceMethod(
    "page-act-harness/approval-store.ts:revokeApproval",
    { reason },
    () => {
      traceDecision("page-act-harness.approval.revoked", {
        approval_id: approval.approval_id,
        reason,
      });
      // Worker restart never auto-restores a revoked/used approval nonce.
      return { ...approval, revoked: true };
    },
  );

export type ApprovalStore = {
  records: Map<string, Approval>;
};

// Stateful product path: the store owns the used/revoked record, so
// consuming the same approval twice — even with two copies of the original
// object — fails on the second attempt. The pure grantApproval/
// consumeApproval helpers above remain for validation-only call sites.
export const createApprovalStore = (): ApprovalStore =>
  traceMethod(
    "page-act-harness/approval-store.ts:createApprovalStore",
    {},
    () => {
      traceDecision("page-act-harness.approval.store_created", {});
      return { records: new Map<string, Approval>() };
    },
  );

export const grantStoredApproval = (
  store: ApprovalStore,
  opts: {
    approval_id: string;
    plan_id: string;
    plan_revision: number;
    request_revision: number;
    scope: string;
  },
): Approval =>
  traceMethod(
    "page-act-harness/approval-store.ts:grantStoredApproval",
    { plan_revision: opts.plan_revision },
    () => {
      if (store.records.has(opts.approval_id))
        throw new Error("APPROVAL_ID_CONFLICT");
      const approval = grantApproval(opts);
      store.records.set(approval.approval_id, approval);
      return { ...approval };
    },
  );

export const consumeStoredApproval = (
  store: ApprovalStore,
  approvalId: string,
  expected: {
    plan_id: string;
    plan_revision: number;
    request_revision: number;
    binding_current: boolean;
  },
): Approval =>
  traceMethod(
    "page-act-harness/approval-store.ts:consumeStoredApproval",
    { plan_revision: expected.plan_revision },
    (context) => {
      const method = "page-act-harness/approval-store.ts:consumeStoredApproval";
      const record = store.records.get(approvalId);
      if (!record) {
        traceBranch(context, method, "fail", approvalId, "unknown approval");
        throw new Error("APPROVAL_NOT_FOUND");
      }
      // Check-and-set against the STORED record is the single-use gate:
      // a second consume of the same id always fails here, regardless of
      // which object copy the caller holds.
      const consumed = consumeApproval(record, expected);
      store.records.set(approvalId, consumed);
      return { ...consumed };
    },
  );

export const revokeStoredApproval = (
  store: ApprovalStore,
  approvalId: string,
  reason: string,
): Approval => {
  const record = store.records.get(approvalId);
  if (!record) throw new Error("APPROVAL_NOT_FOUND");
  const revoked = revokeApproval(record, reason);
  store.records.set(approvalId, revoked);
  return { ...revoked };
};
