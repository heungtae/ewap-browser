export const s19ActionReply = (body, current, returned) => {
  const call = (name, args) => ({
    content: "",
    tool_calls: [
      {
        id: `s19-action-${current.id}-${++current.actionCalls}-abcdefghijkl`,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  });
  const inventoryBlock = [...body.messages]
    .reverse()
    .find((m) => m.content?.startsWith("[UNTRUSTED_EXECUTION_INVENTORY]"));
  const inventory = inventoryBlock
    ? JSON.parse(inventoryBlock.content.split("\n")[1])
    : undefined;
  const executed = !!inventory?.execution_evidence?.length;
  if (executed) {
    if (!current.afterListed) {
      current.afterListed = true;
      return call("list_page_resources", { page_size: 50 });
    }
    const last = returned.at(-1)?.value;
    if (last?.items) {
      const item = last.items.find(
        (item) =>
          item.kind === "component" && item.observed_hint === current.kind,
      );
      current.resource = {
        resource_id: item.resource_id,
        resource_revision: item.revision,
      };
      return call("describe_component", current.resource);
    }
    if (last?.descriptor)
      return call("read_component_data", {
        ...current.resource,
        channel: "subtree",
        max_items: 100,
      });
    return call("report_goal_status", {
      status: "completed",
      summary:
        "The verified approved UI change and freshly read component establish the requested goal.",
      observation_id: inventory.observation_id,
    });
  }
  if (!inventory?.plan)
    return call("submit_plan", {
      request_revision: inventory.request_revision,
      goal: current.actionPrompt,
      evidence_ids: [inventory.observation_id],
      coverage_note: "visible UI action; component is freshly observed",
      provenance: "controlled provider",
      approval_scope: "single_step",
      steps: [
        {
          intent: current.target,
          capability: "propose_click",
          side_effects: ["explicit UI state changes"],
          postcondition:
            "the expanded or page state changes and component is freshly read",
        },
      ],
    });
  const projection = [...body.messages]
    .reverse()
    .find((m) => m.content?.includes("[UNTRUSTED_PAGE_PROJECTION]"))
    ?.content.match(
      /\[UNTRUSTED_PAGE_PROJECTION\]\n([^]*?)\n\[\/UNTRUSTED_PAGE_PROJECTION\]/,
    );
  const node = JSON.parse(projection[1]).nodes.find(
    (node) =>
      node.name === current.target && ["button", "tab"].includes(node.role),
  );
  return call("propose_click", {
    target: node.model_ref,
    approval_scope: "single_step",
    approval_reason:
      "Change only the explicitly requested UI control after user approval.",
  });
};
