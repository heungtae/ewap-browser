import { s20Private } from "./chrome-s20-fixture.mjs";
export const apiControlled = (body, c, returned) => {
  if (body.messages[0]?.content?.includes("Classify the user"))
    return { content: '{"route":"ACTION_REQUIRED"}' };
  const call = (name, args) => ({
    tool_calls: [
      {
        id: `s20-api-${++c.n}-abcdefghijkl`,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  });
  const inventory = JSON.parse(
    body.messages
      .findLast((m) => m.content?.startsWith("[UNTRUSTED_EXECUTION_INVENTORY]"))
      .content.split("\n")[1],
  );
  if (!c.searched) {
    c.searched = true;
    return call("search_page_resources", {
      query: "selectVariant",
      page_size: 8,
    });
  }
  const last = returned.at(-1)?.value;
  if (last?.hits)
    return call("read_page_resource", {
      resource_id: last.hits[0].resource_id,
      resource_revision: last.hits[0].resource_revision,
      offset: last.hits[0].byte_offset,
      max_bytes: 4096,
    });
  if (!inventory.plan)
    return call("submit_plan", {
      request_revision: inventory.request_revision,
      goal: c.prompt,
      evidence_ids: [inventory.observation_id],
      coverage_note: "Registered option and typed DOM completion",
      provenance: "controlled provider",
      approval_scope: "single_step",
      steps: [
        {
          intent: "Choose High",
          capability: "propose_page_api",
          side_effects: ["local variant selection"],
          postcondition: "Variant is High",
        },
      ],
    });
  if (!inventory.execution_evidence?.length)
    return call("propose_page_api", {
      action_ref: inventory.page_api_actions[0].action_ref,
      option_id: "high",
      approval_scope: "single_step",
      approval_reason: "Only the registered local option after approval",
    });
  return call("report_goal_status", {
    status: "completed",
    summary:
      "The typed registered action and current observed selection establish High",
    observation_id: inventory.observation_id,
  });
};
export const apiHtml =
  () => `<!doctype html><title>Registered variant</title><main><h1>Variant</h1><select aria-label="Variant"><option value=low>Low</option><option value=medium>Medium</option><option value=high>High</option></select><p id=status>Ready</p></main>
<script>
window.callCount=0;
window.demoControls={apiVersion:1,selectVariant:async function selectVariant(option){if(this!==window.demoControls)throw Error('receiver lost');window.callCount++;document.querySelector('select').value=option;document.querySelector('#status').textContent='Selected';return window.__privateResult}};
</script>
<script>const api_key="${s20Private}";window.__privateResult={ok:true,token:'${s20Private}'};</script>`;
