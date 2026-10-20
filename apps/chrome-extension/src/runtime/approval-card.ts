import type {
  ApprovalPrompt,
  ApprovalResponse,
} from "@contextpilot/tool-registry";
// Retain the existing event-card hierarchy and action classes.
export function approvalCard(
  document: Document,
  prompt: ApprovalPrompt,
  respond: (response: ApprovalResponse) => Promise<void>,
): HTMLElement {
  const card = document.createElement("article");
  card.className = "event-card";
  card.dataset.kind = "review";
  card.dataset.toolCallId = prompt.toolCallId;
  const heading = document.createElement("div");
  heading.className = "event-heading";
  const title = document.createElement("b");
  title.textContent = prompt.tool;
  const state = document.createElement("span");
  state.className = "tool-state";
  state.textContent = "Approval required";
  heading.append(title, state);
  const detail = document.createElement("div");
  detail.className = "event-detail";
  detail.textContent = `${prompt.effect.business} · ${prompt.target.id} · plan ${prompt.planRevision} · ${prompt.argumentPreview}`;
  const actions = document.createElement("div");
  actions.className = "card-actions";
  for (const choice of ["approve", "deny"] as const) {
    const button = document.createElement("button");
    button.className = choice === "approve" ? "primary" : "danger";
    button.textContent = choice === "approve" ? "Approve" : "Deny";
    button.addEventListener("click", () => {
      for (const element of actions.children)
        (element as HTMLButtonElement).disabled = true;
      void respond({
        promptId: prompt.id,
        promptRevision: prompt.revision,
        preparedDigest: prompt.preparedDigest,
        contextDigest: prompt.contextDigest,
        planRevision: prompt.planRevision,
        choice,
        disclosureScope: prompt.disclosureScope,
      })
        .then(() => {
          state.textContent = choice === "approve" ? "Approved" : "Denied";
        })
        .catch(() => {
          state.textContent = "Approval unavailable";
        });
    });
    actions.append(button);
  }
  card.append(heading, detail, actions);
  return card;
}
