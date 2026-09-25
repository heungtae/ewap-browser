import { evaluate, waitFor } from "./chrome-cdp-utils.mjs";

const manifest = {
  schema_version: 1,
  plugin_id: "fixture.s4-local",
  plugin_version: "1.0.0",
  api_version: 1,
  label: "S4 local plugin",
  adapter_id: "contextpilot.openai-compatible",
  wire_apis: ["chat_completions"],
  auth_schemes: ["authorization_bearer"],
};
const send = (page, message) =>
  evaluate(page, `chrome.runtime.sendMessage(${JSON.stringify(message)})`);
const list = (page) => send(page, { kind: "PROVIDER_LIST" });
const pluginState = async (page) =>
  ((await list(page)).plugins ?? []).find(
    (item) => item.manifest.plugin_id === manifest.plugin_id,
  );
const providerState = async (page) =>
  (await list(page)).providers?.plugin_local;

export const setupS4Plugin = async (page, fixturePort) => {
  const installed = await send(page, {
    kind: "PLUGIN_INSTALL",
    payload: manifest,
  });
  if (installed?.ok !== true) throw new Error("S4_PLUGIN_INSTALL_FAILED");
  const saved = await send(page, {
    kind: "PROVIDER_SAVE",
    payload: {
      id: "plugin_local",
      config: {
        plugin_id: manifest.plugin_id,
        plugin_version: manifest.plugin_version,
        label: "plugin local",
        base_url: `http://127.0.0.1:${fixturePort}/v1`,
        wire_api: "chat_completions",
        model: "fixture",
        api_key: "S4_PLUGIN_SECRET",
        api_key_header: "authorization_bearer",
        headers: [],
        timeout_ms: 3000,
        enabled: true,
      },
    },
  });
  if (saved?.ok !== true) throw new Error("S4_PLUGIN_PROVIDER_SAVE_FAILED");
};

export const checkS4PluginLifecycle = async (page) => {
  await waitFor(
    () => pluginState(page),
    10_000,
    "S4_PLUGIN_RESTART_RESTORE_FAILED",
  );
  const selectPlugin = () =>
    evaluate(
      page,
      `document.querySelector('#provider-plugin-select').value=${JSON.stringify(manifest.plugin_id)}`,
    );
  const click = (id) =>
    evaluate(page, `document.querySelector(${JSON.stringify(id)}).click()`);
  await selectPlugin();
  await click("#plugin-disable");
  await waitFor(
    async () =>
      (await pluginState(page))?.enabled === false &&
      (await providerState(page))?.enabled === false,
    10_000,
    "S4_PLUGIN_DISABLE_FAILED",
  );
  await selectPlugin();
  await click("#plugin-enable");
  await waitFor(
    async () =>
      (await pluginState(page))?.enabled === true &&
      (await providerState(page))?.enabled === true,
    10_000,
    "S4_PLUGIN_ENABLE_FAILED",
  );
  const active = await send(page, {
    kind: "PROVIDER_SET_ACTIVE",
    payload: { id: "plugin_local" },
  });
  if (active?.ok !== true) throw new Error("S4_ACTIVE_PROVIDER_FAILED");
  await selectPlugin();
  await click("#plugin-remove-keep");
  await waitFor(
    async () =>
      !(await pluginState(page)) &&
      (await providerState(page))?.enabled === false,
    10_000,
    "S4_PLUGIN_KEEP_REMOVE_FAILED",
  );
  const retained = await evaluate(
    page,
    "chrome.storage.local.get('provider_settings').then(v=>v.provider_settings?.providers?.plugin_local?.api_key)",
  );
  if (retained !== "S4_PLUGIN_SECRET")
    throw new Error("S4_PLUGIN_SECRET_NOT_RETAINED");
  await evaluate(
    page,
    `(() => { const file=new File([${JSON.stringify(JSON.stringify(manifest))}], 's4-manifest.json', {type:'application/json'}); const files=new DataTransfer(); files.items.add(file); document.querySelector('#plugin-manifest-file').files=files.files; document.querySelector('#plugin-install').click(); })()`,
  );
  await waitFor(
    () => pluginState(page),
    10_000,
    "S4_PLUGIN_REINSTALL_NOT_VISIBLE",
  );
  await selectPlugin();
  await click("#plugin-remove-delete");
  await waitFor(
    async () => !(await pluginState(page)) && !(await providerState(page)),
    10_000,
    "S4_PLUGIN_DELETE_REMOVE_FAILED",
  );
  const deleted = await evaluate(
    page,
    "chrome.storage.local.get('provider_settings').then(v=>v.provider_settings?.providers?.plugin_local?.api_key)",
  );
  if (deleted !== undefined) throw new Error("S4_PLUGIN_SECRET_NOT_DELETED");
};
