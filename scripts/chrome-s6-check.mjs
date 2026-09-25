import { evaluate, waitFor } from "./chrome-cdp-utils.mjs";
import { s6ToolResult } from "./chrome-s6-fixture.mjs";

const toolOutput = (body, id) => {
  const message = body.messages.find((item) =>
    item.tool_call_id?.startsWith(`s6-${id}-`),
  );
  return message && s6ToolResult(message);
};
const send = (panel, message) =>
  evaluate(panel, `chrome.runtime.sendMessage(${JSON.stringify(message)})`);

export const checkS6 = async ({ panel, fixtureData }) => {
  const capturePermission = await evaluate(
    panel,
    "chrome.permissions.contains({origins:['<all_urls>']})",
  );
  if (capturePermission !== true)
    throw new Error("S6_CAPTURE_PERMISSION_MISSING");
  const resolver = {
    schema_version: 1,
    deployment_id: "s1-fixture",
    url: `https://s1.fixture.test:${fixtureData.fixturePort}/v1/resolve`,
    allowed_origins: [`https://s1.fixture.test:${fixtureData.fixturePort}`],
    key_ring: { s1: fixtureData.publicKey },
  };
  await evaluate(
    panel,
    `chrome.storage.local.set(${JSON.stringify({ profile_resolver: resolver })})`,
  );
  const config = {
    plugin_id: "contextpilot.openai-compatible",
    plugin_version: "1.0.0",
    label: "S6 fixture",
    base_url: `https://s1.fixture.test:${fixtureData.fixturePort}/v1`,
    wire_api: "chat_completions",
    model: "fixture-model",
    api_key: "",
    api_key_header: "none",
    headers: [],
    timeout_ms: 30_000,
    enabled: true,
  };
  if (
    (
      await send(panel, {
        kind: "PROVIDER_SAVE",
        payload: { id: "fixture", config },
      })
    )?.ok !== true
  )
    throw new Error("S6_PROVIDER_SAVE_FAILED");
  await evaluate(
    panel,
    "(() => {document.querySelector('#mode-ask').click();document.querySelector('#chat-input').value='S6 positive tool read';document.querySelector('#chat-form').requestSubmit();return true})()",
  );
  try {
    await waitFor(
      async () =>
        fixtureData.providerRequests.length >= 3 &&
        (await evaluate(
          panel,
          "document.querySelector('#chat-messages')?.textContent.includes('S6 read tools complete') && document.querySelector('#chat-send')?.dataset.state === 'send'",
        )),
      20_000,
      "S6_TOOL_TURN_NOT_COMPLETED",
    );
  } catch (error) {
    const panelState = await evaluate(
      panel,
      "({send:document.querySelector('#chat-send')?.dataset.state,complete:document.querySelector('#chat-messages')?.textContent.includes('S6 read tools complete'),cards:[...document.querySelectorAll('.event-card')].map(item=>({kind:item.dataset.kind,title:item.querySelector('b')?.textContent,state:item.querySelector('.tool-state')?.textContent,detail:item.dataset.kind==='error'?item.querySelector('.event-detail')?.textContent:undefined})).slice(-10)})",
    );
    throw new Error(
      `${error.message}: calls=${fixtureData.providerRequests.length}, outputs=${fixtureData.providerRequests.map((body) => body.messages?.filter((item) => item.role === "tool").length).join(",")}, panel=${JSON.stringify(panelState)}`,
    );
  }
  const requests = fixtureData.providerRequests;
  if (requests.length !== 3) throw new Error("S6_PROVIDER_CALL_COUNT");
  const initial = requests[0].messages.findLast((item) => item.role === "user");
  if (
    !initial?.content.includes("[UNTRUSTED_PAGE_PROJECTION]") ||
    !initial.content.includes('"schema_version":2') ||
    !initial.content.includes('"scope":"all_dom"')
  )
    throw new Error("S6_INITIAL_PROJECTION_CONTRACT");
  const toolNames = requests[0].tools.map((item) => item.function.name);
  if (
    ![
      "read_page",
      "get_page_text",
      "find",
      "read_batch",
      "tabs_context",
      "screenshot",
      "zoom",
    ].every((name) => toolNames.includes(name)) ||
    toolNames.some((name) => /click|type|navigate|submit/.test(name))
  )
    throw new Error("S6_PROVIDER_TOOL_AUTHORITY");
  const second = requests[1];
  const tree = toolOutput(second, "tree");
  const visible = toolOutput(second, "visible");
  const interactive = toolOutput(second, "interactive");
  const text = toolOutput(second, "text");
  const find = toolOutput(second, "find");
  const batch = toolOutput(second, "batch");
  const tabs = toolOutput(second, "tabs");
  const screenshot = toolOutput(second, "screenshot");
  const zoom = toolOutput(requests[2], "zoom");
  const hiddenReasons = new Map(
    tree?.nodes?.map((node) => [node.name, node.hidden_reason]) ?? [],
  );
  if (
    tree?.scope !== "all_dom" ||
    !tree.nodes?.some(
      (node) =>
        node.role === "heading" && node.name === "Case S6" && node.visible,
    ) ||
    !tree.nodes?.some(
      (node) =>
        node.role === "button" &&
        node.name === "Publish report" &&
        node.visible,
    ) ||
    !tree.nodes?.some(
      (node) =>
        node.name === "Internal queue" &&
        node.visible === false &&
        node.hidden_reason === "display_none",
    ) ||
    hiddenReasons.get("Hidden visibility") !== "visibility_hidden" ||
    hiddenReasons.get("Hidden opacity") !== "opacity_zero" ||
    hiddenReasons.get("Hidden aria child") !== "ancestor_hidden" ||
    hiddenReasons.get("Collapsed action") !== "collapsed" ||
    visible?.scope !== "visible_only" ||
    visible.nodes?.some((node) => !node.visible) ||
    interactive?.scope !== "interactive" ||
    interactive.nodes?.some(
      (node) =>
        !node.visible ||
        ![
          "button",
          "checkbox",
          "combobox",
          "link",
          "radio",
          "textbox",
          "tab",
          "menuitem",
        ].includes(node.role),
    ) ||
    !text?.text?.includes("Visible article details") ||
    text.text.includes("Internal queue") ||
    find?.[0]?.name !== "Internal queue" ||
    find[0].visible !== false ||
    batch?.map((item) => item.tool).join(",") !== "find,get_page_text" ||
    batch[0].result[0].name !== "Publish report" ||
    tabs?.tabs?.length !== 1 ||
    tabs.tabs[0].url !==
      `https://s1.fixture.test:${fixtureData.fixturePort}/` ||
    screenshot?.mime_type !== "image/jpeg" ||
    !screenshot?.data_url?.startsWith("data:image/jpeg;base64,") ||
    zoom?.mime_type !== "image/jpeg" ||
    zoom?.capture_id === screenshot.capture_id
  )
    throw new Error("S6_READ_TOOL_RESULT_MISMATCH");
  const forbidden = [
    "S6_SECRET_PASSWORD",
    "S6_SECRET_OTP",
    "S6_SECRET_API_KEY",
    "S6_SECRET_STORAGE",
    "S6_URL_SECRET",
    "S6_FRAGMENT_SECRET",
    "S6_SHADOW_SECRET",
    "S6_IFRAME_SECRET",
    "S1_SECRET_COOKIE",
  ];
  if (forbidden.some((secret) => JSON.stringify(requests).includes(secret)))
    throw new Error("S6_OUTBOUND_SECRET_LEAK");
  const persisted = await evaluate(
    panel,
    "Promise.all([chrome.storage.session.get(null),chrome.storage.local.get(null)]).then(items=>JSON.stringify(items))",
  );
  if (
    persisted.includes("data:image/") ||
    persisted.includes(screenshot.capture_id) ||
    persisted.includes(zoom.capture_id)
  )
    throw new Error("S6_CAPTURE_PERSISTED");
  const cards = await evaluate(
    panel,
    "document.querySelectorAll('.event-card[data-kind=tool]').length",
  );
  if (cards < 9) throw new Error("S6_TOOL_TIMELINE_MISSING");
  return { calls: requests.length, tools: cards };
};
