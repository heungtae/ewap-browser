import { evaluate, waitFor } from "./chrome-cdp-utils.mjs";
import { checkS1Lifecycle } from "./chrome-s1-lifecycle.mjs";

const forbiddenValues = [
  "S1_SECRET_PASSWORD",
  "S1_SECRET_OTP",
  "S1_SECRET_TOKEN",
  "S1_SECRET_RECOVERY",
  "S1_SECRET_COOKIE",
];
const assertNoSecrets = (value, stage) => {
  if (forbiddenValues.some((secret) => JSON.stringify(value).includes(secret)))
    throw new Error(`${stage}: credential value crossed the boundary`);
};
const checkedPreview = async (panel) => {
  const result = await evaluate(
    panel,
    "chrome.runtime.sendMessage({kind:'START_PREVIEW'})",
  );
  if (result?.ok !== true || result.snapshot?.schema_version !== 2)
    throw new Error(`PREVIEW_FAILED: ${result?.code ?? "missing snapshot"}`);
  assertNoSecrets(result, "PREVIEW");
  return result.snapshot;
};

export const checkS1 = async ({
  panel,
  panelWindowId,
  fixtureTarget,
  fixturePort,
  fixtureData,
  version,
  worker,
  cdpPort,
}) => {
  const first = await checkedPreview(panel);
  const inspect = first.nodes?.find(
    (node) => node.role === "button" && node.name === "Inspect",
  );
  if (
    !inspect ||
    !first.nodes.some(
      (node) => node.role === "textbox" && node.name === "Case name",
    )
  )
    throw new Error("LABELLED_CONTROL_MISSING");
  if (
    ['"selector":', '"backend_node_id":', '"coordinate":', '"debugger":'].some(
      (key) => JSON.stringify(first).includes(key),
    )
  )
    throw new Error("PROJECTION_EXPOSED_CDP_DETAIL");
  const missing = await evaluate(
    panel,
    "chrome.runtime.sendMessage({kind:'RESOLVE_PROFILE'})",
  );
  if (missing?.code !== "PROFILE_UNAVAILABLE")
    throw new Error(`MISSING_RESOLVER_NOT_CLOSED: ${missing?.code}`);

  const settings = {
    schema_version: 1,
    deployment_id: "s1-fixture",
    url: `https://s1.fixture.test:${fixturePort}/v1/resolve`,
    allowed_origins: [`https://s1.fixture.test:${fixturePort}`],
    key_ring: { s1: fixtureData.publicKey },
  };
  const provider = {
    schema_version: 1,
    providers: {
      fixture: {
        plugin_id: "contextpilot.openai-compatible",
        plugin_version: "1.0.0",
        label: "S1 fixture",
        base_url: `https://s1.fixture.test:${fixturePort}/v1`,
        wire_api: "chat_completions",
        model: "fixture",
        api_key: "",
        api_key_header: "none",
        headers: [],
        timeout_ms: 120000,
        enabled: true,
      },
    },
    active_provider: "fixture",
  };
  const configured = await evaluate(
    panel,
    `chrome.storage.local.set(${JSON.stringify({
      profile_resolver: settings,
      provider_settings: provider,
    })}).then(() => true)`,
  );
  if (configured !== true) throw new Error("SETTINGS_WRITE_FAILED");
  const storedSettings = await evaluate(
    worker,
    "chrome.storage.local.get('profile_resolver').then(({profile_resolver}) => ({url:profile_resolver?.url, keys:Object.keys(profile_resolver?.key_ring ?? {}).length}))",
  );
  if (storedSettings?.url !== settings.url || storedSettings.keys !== 1)
    throw new Error("RESOLVER_SETTINGS_NOT_VISIBLE_TO_WORKER");
  const matched = await evaluate(
    panel,
    "chrome.runtime.sendMessage({kind:'RESOLVE_PROFILE'})",
  );
  if (
    matched?.ok !== true ||
    matched.resolution !== "MATCHED" ||
    matched.profile_id !== "s1-profile"
  ) {
    throw new Error(
      `VALID_JWS_NOT_MATCHED: ${matched?.code ?? matched?.resolution}; resolver_requests=${fixtureData.resolveCount()}`,
    );
  }
  fixtureData.setInvalidSignature(true);
  const invalid = await evaluate(
    panel,
    "chrome.runtime.sendMessage({kind:'RESOLVE_PROFILE'})",
  );
  if (invalid?.code !== "PROFILE_UNAVAILABLE")
    throw new Error(`INVALID_JWS_NOT_REJECTED: ${invalid?.code}`);
  fixtureData.setInvalidSignature(false);

  await evaluate(
    panel,
    `(() => {
    document.querySelector('#mode-ask').click();
    document.querySelector('#chat-input').value = '현재 페이지의 공개 Case 이름을 알려줘';
    document.querySelector('#chat-form').requestSubmit();
    return true;
  })()`,
  );
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('#chat-messages')?.textContent.includes('S1 fixture answer')",
      ),
    20_000,
    "ASK_ANSWER_MISSING",
  );
  if (fixtureData.providerRequests.length === 0)
    throw new Error("PROVIDER_REQUEST_MISSING");
  if (fixtureData.credentialHeaderCount() !== 0)
    throw new Error("BROWSER_CREDENTIAL_HEADER_EGRESS");
  assertNoSecrets(fixtureData.providerRequests, "PROVIDER");
  const stored = await evaluate(panel, "chrome.storage.local.get(null)");
  assertNoSecrets(stored, "STORAGE");
  const diagnostics = await evaluate(
    panel,
    `chrome.runtime.sendMessage(${JSON.stringify({
      kind: "PANEL_REQUEST",
      window_id: panelWindowId,
      payload: { schema_version: 1, kind: "DIAGNOSTICS_BUNDLE_EXPORT" },
    })})`,
  );
  if (diagnostics?.ok !== true || !diagnostics.data?.sections)
    throw new Error(`DIAGNOSTICS_EXPORT_FAILED: ${diagnostics?.code}`);
  assertNoSecrets(diagnostics.data, "DIAGNOSTICS");

  await checkS1Lifecycle({
    panel,
    fixtureTarget,
    fixturePort,
    first,
    inspect,
    checkedPreview,
    version,
    worker,
    cdpPort,
  });
  return {
    resolverRequests: fixtureData.resolveCount(),
    providerRequests: fixtureData.providerRequests.length,
    workerRestarted: true,
  };
};
