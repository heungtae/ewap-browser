// Controlled provider double only: product planning never uses fixture names.
export const s17ProviderReply = (body, current) => {
  const block = [...(body.messages ?? [])]
    .reverse()
    .find((message) =>
      message.content?.startsWith("[UNTRUSTED_EXECUTION_INVENTORY]"),
    );
  if (!block) return;
  const inventory = JSON.parse(block.content.split("\n")[1]);
  const call = (name, args) => ({
    tool_calls: [
      {
        id: `s17-${name}-${(current.s17Calls = (current.s17Calls ?? 0) + 1)}`,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  });
  const steps = current.multiple ? 2 : 1;
  if (inventory.execution_evidence.length >= steps) {
    return call("report_goal_status", {
      status: "completed",
      summary:
        "The typed results and fresh observation confirm the requested input.",
      observation_id: inventory.observation_id,
    });
  }
  if (!inventory.plan) {
    return call("submit_plan", {
      request_revision: inventory.request_revision,
      goal: current.prompt,
      evidence_ids: [inventory.observation_id],
      coverage_note: "visible_only; input targets are observed",
      provenance: "controlled provider plan",
      approval_scope: "single_step",
      steps: Array.from({ length: steps }, (_, index) => ({
        intent: index ? "Fill Draft annotation" : `Fill ${current.target}`,
        capability: current.tool,
        user_input: current.multiple
          ? index
            ? "second 'quoted'"
            : "first ⟪holdout⟫"
          : current.value,
        side_effects: ["visible input value changes"],
        postcondition: "The typed value matches the approved user input",
      })),
    });
  }
};
