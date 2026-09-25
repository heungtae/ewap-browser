/** S4 Chrome evidence: Settings write-only secrets and permission-gated HTTP. */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir, networkInterfaces } from "node:os";
import { join, resolve } from "node:path";
import { cdp, evaluate, reservePort, waitFor } from "./chrome-cdp-utils.mjs";
import { checkS4BeforeGrant } from "./chrome-s4-check.mjs";
import { checkS4PluginLifecycle } from "./chrome-s4-lifecycle.mjs";
const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable) throw new Error("CHROME_FOR_TESTING_BIN is required");
const profile = await mkdtemp(join(tmpdir(), "s4-profile-"));
const captures = [];
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  captures.push({
    path: request.url,
    headers: request.headers,
    body: Buffer.concat(chunks).toString(),
  });
  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      choices: [{ message: { content: "S4 loopback answer" } }],
    }),
  );
});
await new Promise((done) => server.listen(0, "0.0.0.0", done));
const fixturePort = server.address().port;
const privateIp = Object.values(networkInterfaces())
  .flat()
  .find(
    (address) =>
      address?.family === "IPv4" &&
      /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(address.address),
  )?.address;
if (!privateIp) throw new Error("S4_PRIVATE_IPV4_UNAVAILABLE");
let child;
try {
  const cdpPort = await reservePort();
  const chromeArgs = [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--user-data-dir=${profile}`,
    `--disable-extensions-except=${resolve("dist-extension")}`,
    `--load-extension=${resolve("dist-extension")}`,
    `--remote-debugging-port=${cdpPort}`,
    "about:blank",
  ];
  child = spawn(executable, chromeArgs, { stdio: "ignore" });
  let version = await waitFor(
    () =>
      fetch(`http://127.0.0.1:${cdpPort}/json/version`)
        .then((r) => r.json())
        .catch(() => undefined),
    10_000,
    "S4_CHROME_NOT_READY",
  );
  const targets = () =>
    fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json());
  const worker = await waitFor(
    async () =>
      (await targets()).find(
        (item) =>
          item.type === "service_worker" &&
          item.url.endsWith("/js/service-worker.js"),
      ),
    10_000,
    "S4_WORKER_NOT_READY",
  );
  const extensionId = new URL(worker.url).host;
  const url = `chrome-extension://${extensionId}/settings/index.html`;
  await cdp(version.webSocketDebuggerUrl, "Target.createTarget", { url });
  const settings = await waitFor(
    async () =>
      (await targets()).find(
        (item) => item.type === "page" && item.url === url,
      ),
    10_000,
    "S4_SETTINGS_NOT_READY",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#provider-form') && document.querySelector('#provider-plugin-select option')",
      ),
    10_000,
    "S4_SETTINGS_SCRIPT_NOT_READY",
  );
  const { reopened: beforeGrantPage, testMessage } = await checkS4BeforeGrant({
    settings,
    version,
    url,
    targets,
    fixturePort,
    captures,
    privateIp,
  });
  let reopened = beforeGrantPage;
  child.kill("SIGTERM");
  await new Promise((done) => child.once("close", done));
  const preferencesPath = join(profile, "Default/Preferences");
  const preferences = JSON.parse(await readFile(preferencesPath, "utf8"));
  const extension = preferences.extensions?.settings?.[extensionId];
  if (!extension?.granted_permissions || !extension?.active_permissions)
    throw new Error("S4_EXTENSION_PREFERENCES_MISSING");
  for (const state of [
    extension.granted_permissions,
    extension.active_permissions,
  ])
    state.explicit_host = [
      ...new Set([
        ...state.explicit_host,
        "http://127.0.0.1/*",
        `http://${privateIp}/*`,
      ]),
    ];
  await writeFile(preferencesPath, JSON.stringify(preferences));
  child = spawn(executable, chromeArgs, { stdio: "ignore" });
  version = await waitFor(
    () =>
      fetch(`http://127.0.0.1:${cdpPort}/json/version`)
        .then((r) => r.json())
        .catch(() => undefined),
    10_000,
    "S4_CHROME_RESTART_FAILED",
  );
  await cdp(version.webSocketDebuggerUrl, "Target.createTarget", { url });
  reopened = await waitFor(
    async () =>
      (await targets()).find(
        (item) => item.type === "page" && item.url === url,
      ),
    10_000,
    "S4_SETTINGS_RESTART_FAILED",
  );
  await waitFor(
    () =>
      evaluate(
        reopened,
        "chrome.permissions.contains({origins:['http://127.0.0.1/*']})",
      ),
    5_000,
    "S4_FIXTURE_HOST_GRANT_MISSING",
  );
  const tested = await evaluate(
    reopened,
    `chrome.runtime.sendMessage(${JSON.stringify(testMessage)})`,
  );
  if (
    tested?.ok !== true ||
    captures.length !== 1 ||
    captures[0].headers.authorization !== "Bearer S4_SECRET_KEY" ||
    captures[0].headers["x-fixture"] !== "S4_SECRET_HEADER" ||
    captures[0].headers.cookie
  )
    throw new Error(`S4_HTTP_DISPATCH_FAILED_${JSON.stringify(tested)}`);
  const privateMessage = {
    ...testMessage,
    payload: { ...testMessage.payload, id: "private" },
  };
  const privateTested = await evaluate(
    reopened,
    `chrome.runtime.sendMessage(${JSON.stringify(privateMessage)})`,
  );
  if (
    privateTested?.ok !== true ||
    captures.length !== 2 ||
    !captures[1].path.startsWith("/v1/") ||
    captures.some((capture) => capture.body.includes("S4_SECRET"))
  )
    throw new Error(
      `S4_PRIVATE_HTTP_DISPATCH_FAILED_${JSON.stringify(privateTested)}`,
    );
  const publicResults = [
    await evaluate(
      reopened,
      "chrome.runtime.sendMessage({kind:'PROVIDER_LIST'})",
    ),
    await evaluate(
      reopened,
      "chrome.runtime.sendMessage({kind:'PROVIDER_EXPORT'})",
    ),
  ];
  if (JSON.stringify(publicResults).includes("S4_SECRET"))
    throw new Error("S4_PUBLIC_SECRET_LEAK");
  await checkS4PluginLifecycle(reopened);
  console.log(
    `S4 Chrome passed: blank Settings secrets, denied-before-grant, gesture initiated, seeded host grants, loopback/private dispatch, no cookie; requests=${captures.length}`,
  );
} finally {
  child?.kill("SIGTERM");
  if (child) await new Promise((done) => child.once("close", done));
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
