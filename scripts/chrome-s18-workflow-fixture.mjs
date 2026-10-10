import { evaluate } from "./chrome-cdp-utils.mjs";
import { semanticFingerprint } from "../dist/profile/fingerprint.js";

export const s18Declaration = (id) => ({
  schema_version: 1,
  id,
  title: "S18 shared title",
  steps: [
    {
      id: "preview-" + "원본경계".repeat(12),
      tool: "click_by_ref",
      target: { role: "button", name: "Generate preview" },
    },
  ],
});
export const prepareS18 = async (panel, page, fixture) => {
  const origin = `https://s1.fixture.test:${fixture.fixturePort}`;
  await evaluate(
    panel,
    `chrome.storage.local.set(${JSON.stringify({
      profile_resolver: {
        schema_version: 1,
        deployment_id: "s1-fixture",
        url: `${origin}/v1/resolve`,
        allowed_origins: [origin],
        key_ring: { s1: fixture.publicKey },
      },
    })})`,
  );
  await evaluate(
    page,
    `(() => {document.querySelectorAll('script[type="application/contextpilot-workflow+json"]').forEach(e=>e.remove());const script=document.createElement('script');script.type='application/contextpilot-workflow+json';script.textContent=${JSON.stringify(JSON.stringify(s18Declaration("s18-generated")))};document.body.append(script);return true})()`,
  );
  await evaluate(
    page,
    "(() => {if(document.querySelector('#report-scope').value!=='detailed'||!document.querySelector('#include-details').checked||document.querySelector('#preview').disabled)throw Error('S18_PRECONDITION_NOT_READY');document.querySelector('#result').textContent='Detailed report scope is selected, detailed results are included, and Preview is ready.';return true})()",
  );
  const tab = await evaluate(
    panel,
    "chrome.tabs.query({active:true,lastFocusedWindow:true}).then(tabs=>tabs[0]?.id)",
  );
  const response = await evaluate(
    panel,
    `chrome.tabs.sendMessage(${tab},{kind:'CONTENT_SNAPSHOT',scope:'all_dom'})`,
  );
  if (!response?.ok) throw Error("S18_SNAPSHOT_MISSING");
  const record = {
    id: "s18-recorded-abcdefghijkl",
    title: "S18 shared title",
    enabled: true,
    origin,
    path_prefix: "/",
    fingerprint: semanticFingerprint(response.snapshot.snapshot).fingerprint,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    declaration: s18Declaration("s18-recorded-abcdefghijkl"),
  };
  await evaluate(
    panel,
    `chrome.storage.local.set(${JSON.stringify({ saved_workflows_v1: { schema_version: 1, records: [record] } })})`,
  );
};

export const s18ProviderReply = (body, current) => {
  const names = body.tools?.map((tool) => tool.function.name) ?? [];
  const call = (name, args) => ({
    tool_calls: [
      {
        id: `s18-${String(++current.s18Calls).padStart(16, "0")}`,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  });
  const results = (body.messages ?? [])
    .filter((message) => message.role === "tool")
    .flatMap((message) => {
      try {
        return [
          JSON.parse(
            message.content
              .replace(/^\[UNTRUSTED_TOOL_RESULT\]\n/, "")
              .replace(/\n\[\/UNTRUSTED_TOOL_RESULT\]$/, ""),
          ),
        ];
      } catch {
        return [];
      }
    });
  if (names.includes("submit_review")) {
    const pages = results.filter((result) => Array.isArray(result.resources));
    const last = pages.at(-1);
    if (!last) return call("list_workflow_resources", { page_size: 1 });
    if (last.next_cursor)
      return call("list_workflow_resources", last.continuation.arguments);
    const resources = pages.flatMap((result) => result.resources);
    const selected = resources.find(
      (item) => item.source === current.s18Source,
    );
    if (!selected) throw Error("S18_RESOURCE_MISSING");
    const read = results
      .filter(
        (result) =>
          result.resource_id === selected.resource_id &&
          typeof result.source_text === "string",
      )
      .at(-1);
    if (!read)
      return call("read_workflow_resource", {
        resource_id: selected.resource_id,
        resource_revision: selected.resource_revision,
        max_bytes: 256,
      });
    if (read.next_cursor)
      return call("read_workflow_resource", read.continuation.arguments);
    return call("submit_review", {
      verdict: current.mismatch ? "mismatch" : "match",
      rationale: current.mismatch
        ? "The read workflow generates Preview; it does not enter Search query. Original input goal is preserved."
        : "The complete original describes the requested visible Preview action.",
      missing: [],
    });
  }
  if (names.includes("report_goal_status")) {
    const match = body.messages
      .map((m) => m.content)
      .join("\n")
      .match(
        /\[UNTRUSTED_EXECUTION_INVENTORY\]\n([^]*?)\n\[\/UNTRUSTED_EXECUTION_INVENTORY\]/,
      );
    const inventory = JSON.parse(match[1]);
    if (inventory.execution_evidence.length)
      return call("report_goal_status", {
        status: "completed",
        summary: "Typed result and fresh observation verify Preview.",
        observation_id: inventory.observation_id,
      });
  }
};
