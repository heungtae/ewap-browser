export function s24ActProvider(body, index) {
  const tool = (name) => body.tools?.find((t) => t.function.name === name);
  const call = (name, args) => ({
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id: `s24-act-${index}-abcdefghijklmnop`,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  });
  if (body.messages[0]?.content?.includes("Classify the user"))
    return { role: "assistant", content: '{"route":"ACTION_REQUIRED"}' };
  const message = body.messages.findLast((m) =>
    m.content?.startsWith("[UNTRUSTED_EXECUTION_INVENTORY]"),
  );
  const inventory = message ? JSON.parse(message.content.split("\n")[1]) : {};
  const goal = tool("report_goal_status");
  if (goal)
    return call("report_goal_status", {
      status: inventory.execution_evidence?.every(
        (e) => e.outcome === "VERIFIED",
      )
        ? "completed"
        : "unknown",
      summary: "The current request value is entered in the field.",
      observation_id:
        goal.function.parameters.properties.observation_id.enum[0],
    });
  const results = body.messages
    .filter((m) => m.role === "tool")
    .map((m) => {
      try {
        return JSON.parse(m.content.split("\n")[1]);
      } catch {
        return {};
      }
    });
  const current =
    body.messages.findLast((m) =>
      m.content?.includes("User execution request:"),
    )?.content ?? "";
  const value = current.includes("beta-current")
    ? "beta-current"
    : "alpha-current";
  const command = body.tools?.find((t) =>
    t.function.name.startsWith("page_cmd_"),
  );
  if (
    command &&
    !results.some(
      (r) => r.requires === "fresh_discovery_submit_plan_and_approval",
    )
  )
    return call(command.function.name, { query: value });
  if (!command && !results.some((r) => r.saved === false))
    return call("describe_learned_task", {
      kind: "search",
      target: "form",
      coverage: "visible",
      input: "text",
    });
  if (!inventory.plan && tool("submit_plan"))
    return call("submit_plan", {
      request_revision: inventory.request_revision,
      goal: "Enter current user request value",
      evidence_ids: [inventory.observation_id],
      coverage_note: "current visible form",
      provenance: "current snapshot",
      approval_scope: "single_step",
      steps: [
        {
          intent: "Enter supplied text",
          capability: "propose_set_text",
          target_evidence_id: inventory.observation_id,
          user_input: value,
          postcondition: "current field contains supplied value",
        },
      ],
    });
  const text = tool("propose_set_text");
  if (text)
    return call("propose_set_text", {
      target: text.function.parameters.properties.target.enum[0],
      value,
      value_source_revision: inventory.request_revision,
      approval_scope: "single_step",
      approval_reason: "Current request input",
    });
  return {
    role: "assistant",
    content: "The current request cannot be completed.",
  };
}
