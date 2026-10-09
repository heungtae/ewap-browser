import type { ChatActionView } from "../contracts/chat-event-types.js";

type Proposal = {
  id: string;
  tool: string;
  targetName: string;
  approvalScope: "single_step" | "session";
  approvalReason: string;
  value?: string;
};
type Session = {
  id: string;
  origin: string;
  workflow?: {
    declaration: { title: string; steps: unknown[] };
    count: number;
  };
};

export const actionReview = (session: Session, proposal: Proposal) => ({
  ok: true,
  state: "ACTION_REVIEW",
  session_id: session.id,
  proposal_id: proposal.id,
  tool: proposal.tool,
  target_name: proposal.targetName,
  approval_scope: proposal.approvalScope,
  approval_reason: proposal.approvalReason,
  origin: session.origin,
});

export const actionView = (
  session: Session,
  proposal: Proposal,
): ChatActionView => ({
  session_id: session.id,
  proposal_id: proposal.id,
  tool: proposal.tool,
  target_name: proposal.targetName,
  approval_scope: proposal.approvalScope,
  approval_reason: proposal.approvalReason,
  origin: session.origin,
  // The ephemeral approval event carries the entire supported value so the
  // user can inspect changes anywhere in it before authorizing execution.
  // Diagnostics and persisted history must continue to redact raw values.
  ...(proposal.value === undefined
    ? {}
    : {
        suggested_value: proposal.value,
        suggested_value_length: [...proposal.value].length,
      }),
  ...(session.workflow
    ? {
        workflow_title: session.workflow.declaration.title,
        workflow_step: session.workflow.count + 1,
        workflow_total: session.workflow.declaration.steps.length,
      }
    : {}),
});
