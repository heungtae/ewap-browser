import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";
import { setupS4Plugin } from "./chrome-s4-lifecycle.mjs";

export const checkS4BeforeGrant = async ({
  settings,
  version,
  url,
  targets,
  fixturePort,
  captures,
  privateIp,
}) => {
  const config = {
    plugin_id: "contextpilot.openai-compatible",
    plugin_version: "1.0.0",
    label: "S4 fixture",
    base_url: `http://127.0.0.1:${fixturePort}/v1`,
    wire_api: "chat_completions",
    model: "fixture",
    api_key: "S4_SECRET_KEY",
    api_key_header: "authorization_bearer",
    headers: [{ name: "x-fixture", value: "S4_SECRET_HEADER" }],
    timeout_ms: 3000,
    enabled: true,
    private_network_opt_in: false,
  };
  const send = (message) =>
    evaluate(
      settings,
      `chrome.runtime.sendMessage(${JSON.stringify(message)})`,
    );
  const saved = await send({
    kind: "PROVIDER_SAVE",
    payload: { id: "local", config },
  });
  if (saved?.ok !== true) throw new Error(`S4_SAVE_FAILED_${saved?.code}`);
  await cdp(version.webSocketDebuggerUrl, "Target.closeTarget", {
    targetId: settings.id,
  });
  await cdp(version.webSocketDebuggerUrl, "Target.createTarget", { url });
  let reopened = await waitFor(
    async () =>
      (await targets()).find(
        (item) => item.type === "page" && item.url === url,
      ),
    10_000,
    "S4_SETTINGS_REOPEN_FAILED",
  );
  await waitFor(
    () =>
      evaluate(
        reopened,
        "document.querySelector('[name=base_url]')?.value.includes('127.0.0.1')",
      ),
    10_000,
    "S4_PUBLIC_LOAD_FAILED",
  );
  const formSecrets = await evaluate(
    reopened,
    "({ key: document.querySelector('[name=api_key]').value, header: document.querySelector('[name=header_value]').value, status: document.querySelector('#api-key-state').textContent })",
  );
  if (
    formSecrets.key ||
    formSecrets.header ||
    !formSecrets.status.includes("저장됨")
  )
    throw new Error("S4_SETTINGS_SECRET_REEXPOSED");
  const before = await evaluate(
    reopened,
    "chrome.permissions.contains({origins:['http://127.0.0.1/*']})",
  );
  if (before) throw new Error("S4_HTTP_PERMISSION_PREGRANTED");
  const testMessage = {
    kind: "PROVIDER_TEST",
    payload: {
      id: "local",
      request: {
        wire_api: "chat_completions",
        model: "fixture",
        messages: [{ role: "user", content: "test" }],
        stream: false,
      },
    },
  };
  const blocked = await evaluate(
    reopened,
    `chrome.runtime.sendMessage(${JSON.stringify(testMessage)})`,
  );
  if (
    blocked?.ok !== false ||
    blocked.code !== "PROVIDER_UNAVAILABLE" ||
    captures.length
  )
    throw new Error("S4_UNGRANTED_HTTP_SENT_REQUEST");
  const privateSaved = await evaluate(
    reopened,
    `chrome.runtime.sendMessage(${JSON.stringify({ kind: "PROVIDER_SAVE", payload: { id: "private", config: { ...config, base_url: `http://${privateIp}:${fixturePort}/v1`, private_network_opt_in: true } } })})`,
  );
  if (privateSaved?.ok !== true) throw new Error("S4_PRIVATE_SAVE_FAILED");
  const privateBlocked = await evaluate(
    reopened,
    `chrome.runtime.sendMessage(${JSON.stringify({ ...testMessage, payload: { ...testMessage.payload, id: "private" } })})`,
  );
  if (
    privateBlocked?.ok !== false ||
    privateBlocked.code !== "PROVIDER_UNAVAILABLE" ||
    captures.length
  )
    throw new Error("S4_UNGRANTED_PRIVATE_SENT_REQUEST");
  await setupS4Plugin(reopened, fixturePort);
  const box = await evaluate(
    reopened,
    "(() => { const button=document.querySelector('#provider-host-access'); button.scrollIntoView({block:'center'}); const r=button.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()",
  );
  await evaluate(
    reopened,
    "(() => { const request=chrome.permissions.request.bind(chrome.permissions); chrome.permissions.request=(query)=>{window.__s4PermissionRequest=query; return request(query)}; })()",
  );
  await cdp(reopened.webSocketDebuggerUrl, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: box.x,
    y: box.y,
    button: "left",
    clickCount: 1,
  });
  await cdp(reopened.webSocketDebuggerUrl, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: box.x,
    y: box.y,
    button: "left",
    clickCount: 1,
  });
  const requested = await evaluate(
    reopened,
    "window.__s4PermissionRequest?.origins?.[0]",
  );
  if (requested !== "http://127.0.0.1/*")
    throw new Error("S4_HOST_ACCESS_REQUEST_MISSING");
  return { reopened, testMessage };
};
