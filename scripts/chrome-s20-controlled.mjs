import { s19ActionReply } from "./chrome-s19-action-fixture.mjs";
export const s20Controlled = (body, c, returned) => {
  if (body.messages[0]?.content?.includes("Classify the user"))
    return { content: JSON.stringify({ route: "ACTION_REQUIRED" }) };
  const call = (name, args) => ({
    tool_calls: [
      {
        id: `s20-${c.id}-${++c.n}-abcdefghijkl`,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  });
  const last = returned.at(-1)?.value;
  const stage = c.stage ?? 0;
  if (stage === 0) {
    c.stage = 1;
    return call("list_page_resources", { page_size: 50 });
  }
  if (stage === 1) {
    c.component = last.items.find(
      (i) => i.kind === "component" && i.observed_hint === "table",
    );
    c.stage = 2;
    return call("search_page_resources", {
      query: c.functionName,
      page_size: 8,
    });
  }
  if (stage === 2) {
    const hit = last.hits[0];
    c.stage = 3;
    return call("read_page_resource", {
      resource_id: hit.resource_id,
      resource_revision: hit.resource_revision,
      offset: hit.byte_offset,
      max_bytes: 4096,
    });
  }
  if (stage === 3) {
    c.stage = 4;
    return call("list_workflow_resources", {
      source: "page_generated",
      page_size: 50,
    });
  }
  if (stage === 4) {
    c.workflow = last.resources[0];
    c.stage = 5;
    return call("read_workflow_resource", {
      resource_id: c.workflow.resource_id,
      resource_revision: c.workflow.resource_revision,
      max_bytes: 16384,
    });
  }
  if (stage === 5) {
    c.stage = 6;
    return call("describe_component", {
      resource_id: c.component.resource_id,
      resource_revision: c.component.revision,
    });
  }
  if (stage === 6) {
    c.stage = 7;
    return call("read_component_data", {
      resource_id: c.component.resource_id,
      resource_revision: c.component.revision,
      channel: "subtree",
      max_items: 100,
    });
  }
  return s19ActionReply(body, c, returned);
};
