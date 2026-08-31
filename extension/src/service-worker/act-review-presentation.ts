type Proposal = {
  id: string;
  tool: string;
  targetName: string;
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
  origin: session.origin,
});

export const actionView = (session: Session, proposal: Proposal) => ({
  session_id: session.id,
  proposal_id: proposal.id,
  tool: proposal.tool,
  target_name: proposal.targetName,
  origin: session.origin,
  ...(proposal.value === undefined ? {} : { suggested_value: proposal.value }),
  ...(session.workflow
    ? {
        workflow_title: session.workflow.declaration.title,
        workflow_step: session.workflow.count + 1,
        workflow_total: session.workflow.declaration.steps.length,
      }
    : {}),
});
