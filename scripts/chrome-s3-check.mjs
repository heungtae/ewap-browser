import { evaluate, waitFor } from "./chrome-cdp-utils.mjs";

const send = (panel, message) =>
  evaluate(panel, `chrome.runtime.sendMessage(${JSON.stringify(message)})`);
const configFor = (port, scheme, wireApi) => ({
  plugin_id: "contextpilot.openai-compatible",
  plugin_version: "1.0.0",
  label: "S3 fixture",
  base_url: `https://s1.fixture.test:${port}/v1`,
  wire_api: wireApi,
  model: "fixture-model",
  api_key: scheme === "none" ? "" : "S3_SECRET_API_KEY",
  api_key_header: scheme,
  headers: [{ name: "X-Company-Client", value: "fixture-client" }],
  timeout_ms: 30_000,
  enabled: true,
});
const ask = (panel, prompt) =>
  evaluate(
    panel,
    `(() => {
      document.querySelector('#mode-ask').click();
      document.querySelector('#chat-input').value = ${JSON.stringify(prompt)};
      document.querySelector('#chat-form').requestSubmit();
      return true;
    })()`,
  );
const expectedHeader = (scheme) =>
  scheme === "authorization_bearer"
    ? ["authorization", "Bearer S3_SECRET_API_KEY"]
    : scheme === "none"
      ? [undefined, undefined]
      : [scheme, "S3_SECRET_API_KEY"];
const assertCapture = (capture, scheme, wireApi) => {
  const [name, value] = expectedHeader(scheme);
  const headers = capture.headers;
  if (
    capture.path !==
      (wireApi === "responses" ? "/v1/responses" : "/v1/chat/completions") ||
    headers["x-company-client"] !== "fixture-client" ||
    headers.cookie !== undefined ||
    headers.authorization !==
      (scheme === "authorization_bearer" ? value : undefined) ||
    headers["api-key"] !== (scheme === "api-key" ? value : undefined) ||
    headers["x-goog-api-key"] !==
      (scheme === "x-goog-api-key" ? value : undefined) ||
    (name && headers[name] !== value)
  )
    throw new Error(`S3_HEADER_MISMATCH_${scheme}`);
  const body = capture.body;
  if (
    body?.model !== "fixture-model" ||
    body.stream !== true ||
    !Array.isArray(wireApi === "responses" ? body.input : body.messages) ||
    JSON.stringify(body).includes("S3_SECRET_API_KEY")
  )
    throw new Error(`S3_BODY_MISMATCH_${wireApi}`);
};

export const checkS3 = async ({
  panel,
  panelWindowId,
  fixturePort,
  fixtureData,
}) => {
  const resolver = {
    schema_version: 1,
    deployment_id: "s1-fixture",
    url: `https://s1.fixture.test:${fixturePort}/v1/resolve`,
    allowed_origins: [`https://s1.fixture.test:${fixturePort}`],
    key_ring: { s1: fixtureData.publicKey },
  };
  await evaluate(
    panel,
    `chrome.storage.local.set(${JSON.stringify({ profile_resolver: resolver })})`,
  );
  const cases = [
    ["none", "chat_completions"],
    ["authorization_bearer", "chat_completions"],
    ["api-key", "chat_completions"],
    ["x-goog-api-key", "responses"],
  ];
  for (const [scheme, wireApi] of cases) {
    const config = configFor(fixturePort, scheme, wireApi);
    const saved = await send(panel, {
      kind: "PROVIDER_SAVE",
      payload: { id: "fixture", config },
    });
    if (
      saved?.ok !== true ||
      (config.api_key && JSON.stringify(saved).includes(config.api_key))
    )
      throw new Error(`S3_SAVE_OR_REDACTION_${scheme}`);
    const expectedCount = fixtureData.captures.length + 1;
    await ask(panel, `S3 provider turn ${expectedCount}`);
    await waitFor(
      async () =>
        fixtureData.captures.length === expectedCount &&
        (await evaluate(
          panel,
          `document.querySelector('#chat-messages')?.textContent.includes('S3 fixture answer ${expectedCount}')`,
        )),
      20_000,
      `S3_STREAM_${scheme}`,
    );
    assertCapture(fixtureData.captures.at(-1), scheme, wireApi);
    await waitFor(
      () =>
        evaluate(
          panel,
          "document.querySelector('#chat-send')?.dataset.state === 'send'",
        ),
      10_000,
      `S3_TERMINAL_${scheme}`,
    );
  }
  const listed = await send(panel, { kind: "PROVIDER_LIST" });
  const exported = await send(panel, { kind: "PROVIDER_EXPORT" });
  const diagnostics = await send(panel, {
    kind: "PANEL_REQUEST",
    window_id: panelWindowId,
    payload: { schema_version: 1, kind: "DIAGNOSTICS_BUNDLE_EXPORT" },
  });
  if (
    listed?.ok !== true ||
    exported?.ok !== true ||
    diagnostics?.ok !== true ||
    JSON.stringify([listed, exported, diagnostics]).includes(
      "S3_SECRET_API_KEY",
    )
  )
    throw new Error("S3_PUBLIC_SECRET_LEAK");
  const beforeDisable = fixtureData.captures.length;
  const disabled = await send(panel, {
    kind: "PLUGIN_SET_ENABLED",
    payload: {
      plugin_id: "contextpilot.openai-compatible",
      enabled: false,
    },
  });
  if (disabled?.ok !== true) throw new Error("S3_PLUGIN_DISABLE_FAILED");
  const blocked = await send(panel, {
    kind: "PROVIDER_TEST",
    payload: {
      id: "fixture",
      request: { model: "fixture-model", messages: [] },
    },
  });
  if (
    blocked?.ok !== false ||
    blocked.code !== "PROVIDER_PLUGIN_NOT_FOUND" ||
    fixtureData.captures.length !== beforeDisable
  )
    throw new Error("S3_DISABLED_PLUGIN_SENT_REQUEST");
  const errorsBefore = await evaluate(
    panel,
    "document.querySelectorAll('.event-card[data-kind=error]').length",
  );
  await ask(panel, "S3 disabled plugin turn");
  await waitFor(
    () =>
      evaluate(
        panel,
        `document.querySelectorAll('.event-card[data-kind=error]').length > ${errorsBefore} && document.querySelector('#chat-send')?.dataset.state === 'send'`,
      ),
    10_000,
    "S3_DISABLED_ASK_NOT_TERMINAL",
  );
  if (fixtureData.captures.length !== beforeDisable)
    throw new Error("S3_DISABLED_ASK_SENT_REQUEST");
  await send(panel, {
    kind: "PLUGIN_SET_ENABLED",
    payload: { plugin_id: "contextpilot.openai-compatible", enabled: true },
  });
  fixtureData.setHold(true);
  await ask(panel, "S3 cancellation turn");
  await waitFor(
    () => fixtureData.captures.length === beforeDisable + 1,
    20_000,
    "S3_STOP_STREAM_NOT_OPEN",
  );
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('#chat-messages')?.textContent.includes('S3 partial stop')",
      ),
    10_000,
    "S3_STREAM_DELTA_MISSING",
  );
  await evaluate(panel, "document.querySelector('#chat-send').click()");
  await waitFor(
    () => fixtureData.wasAborted(),
    10_000,
    "S3_STOP_DID_NOT_ABORT_PROVIDER",
  );
  fixtureData.setHold(false);
  return { turns: fixtureData.captures.length, stopped: true };
};
