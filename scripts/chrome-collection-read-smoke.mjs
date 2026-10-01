import { spawn, execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:https";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { openAnalysisPanel } from "./chrome-analysis-panel.mjs";

const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable)
  throw new Error("CHROME_FOR_TESTING_BIN must point to Chrome for Testing");
const run = promisify(execFile);
const reservePort = () =>
  new Promise((resolvePort, reject) => {
    const server = createTcpServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close();
      if (!address || typeof address === "string") reject(new Error("no port"));
      else resolvePort(address.port);
    });
  });
const cdp = async (webSocketUrl, method, params = {}) => {
  const socket = new WebSocket(webSocketUrl);
  return new Promise((resolveResult, reject) => {
    socket.addEventListener("open", () =>
      socket.send(JSON.stringify({ id: 1, method, params })),
    );
    socket.addEventListener("message", (event) => {
      const result = JSON.parse(event.data);
      if (result.id !== 1) return;
      socket.close();
      if (result.error) reject(new Error(result.error.message));
      else resolveResult(result.result);
    });
    socket.addEventListener("error", () =>
      reject(new Error("CDP connection failed")),
    );
  });
};
const waitFor = async (value, timeoutMs, message) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await value();
    if (result) return result;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(message);
};
const evaluate = async (target, expression) => {
  const response = await cdp(target.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return response.result?.value;
};

const certificateDirectory = await mkdtemp(
  join(tmpdir(), "contextpilot-collection-cert-"),
);
const profile = await mkdtemp(
  join(tmpdir(), "contextpilot-collection-profile-"),
);
let fixture;
let child;
let chromeStderr = "";
let chromeStdout = "";
let chromeExit = "";
try {
  await run("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(certificateDirectory, "key.pem"),
    "-out",
    join(certificateDirectory, "cert.pem"),
    "-days",
    "1",
    "-subj",
    "/CN=collection.fixture.test",
  ]);
  const fixtureHtml = await readFile(
    "examples/collection-reading-demo/virtual-scroll-grid.html",
    "utf8",
  );
  fixture = createServer(
    {
      key: await readFile(join(certificateDirectory, "key.pem")),
      cert: await readFile(join(certificateDirectory, "cert.pem")),
    },
    (_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(fixtureHtml);
    },
  );
  const fixturePort = await new Promise((resolvePort, reject) => {
    fixture.once("error", reject);
    fixture.listen(0, "127.0.0.1", () => {
      const address = fixture.address();
      if (!address || typeof address === "string") reject(new Error("no port"));
      else resolvePort(address.port);
    });
  });
  const cdpPort = await reservePort();
  child = spawn(
    executable,
    [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--ignore-certificate-errors",
      "--host-resolver-rules=MAP collection.fixture.test 127.0.0.1",
      `--user-data-dir=${profile}`,
      `--disable-extensions-except=${resolve("dist-extension")}`,
      `--load-extension=${resolve("dist-extension")}`,
      `--remote-debugging-port=${cdpPort}`,
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  child.on("exit", (code, signal) => {
    chromeExit = `Chrome exited with code=${code} signal=${signal}`;
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    chromeStdout = `${chromeStdout}${chunk}`.slice(-4000);
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    chromeStderr = `${chromeStderr}${chunk}`.slice(-4000);
  });
  const version = await waitFor(
    async () =>
      fetch(`http://127.0.0.1:${cdpPort}/json/version`)
        .then((r) => r.json())
        .catch(() => undefined),
    90_000,
    `Chrome for Testing did not open CDP${chromeExit || ""}${chromeStdout || chromeStderr ? `: ${chromeStdout}${chromeStderr}` : ""}`,
  );
  const fixtureTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    { url: `https://collection.fixture.test:${fixturePort}/` },
  );
  let observedTargets = [];
  const worker = await waitFor(
    async () => {
      const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
        (r) => r.json(),
      );
      observedTargets = targets.map(({ type, url, title }) => ({
        type,
        url,
        title,
      }));
      return targets.find(
        (target) =>
          target.type === "service_worker" &&
          target.url.endsWith("/js/service-worker.js"),
      );
    },
    10_000,
    `ContextPilot worker was not loaded; targets=${JSON.stringify(observedTargets)}${chromeStderr ? `; stderr=${chromeStderr}` : ""}`,
  );
  const extensionId = new URL(worker.url).host;
  const { panel, panelWindowId } = await openAnalysisPanel({
    cdpPort,
    extensionId,
    fixtureTarget,
    version,
    worker,
  });
  await cdp(version.webSocketDebuggerUrl, "Target.activateTarget", {
    targetId: fixtureTarget.targetId,
  });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  const panelRequest = (payload) =>
    evaluate(
      panel,
      `chrome.runtime.sendMessage(${JSON.stringify({
        kind: "PANEL_REQUEST",
        window_id: panelWindowId,
        payload,
      })})`,
    );
  const discover = await panelRequest({ kind: "COLLECTION_DISCOVER" });
  const grid = discover?.collections?.find(
    (item) => item.object_kind === "grid" && item.has_virtual_scroll === true,
  );
  if (!grid)
    throw new Error(
      `virtual grid was not discovered: ${JSON.stringify(discover)}`,
    );
  const start = (ref) =>
    panelRequest({
      kind: "COLLECTION_READ_START",
      request: { collection_ref: ref, mode: "full" },
    });
  let response = await start(grid.collection_ref);
  if (response?.code === "REQUIRE_PERMISSION") {
    const granted = await panelRequest({
      kind: "PERMISSION_DECISION",
      permission_request_id: response.request_id,
      decision: "always",
    });
    if (granted?.ok !== true)
      throw new Error("collection permission was not granted");
    response = await start(grid.collection_ref);
  }
  const scrollMetrics = await evaluate(
    {
      webSocketDebuggerUrl: (
        await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) =>
          r.json(),
        )
      ).find((target) => target.id === fixtureTarget.targetId)
        .webSocketDebuggerUrl,
    },
    "(() => { const e = document.querySelector('#gridContainer'); return {scrollTop:e?.scrollTop,scrollHeight:e?.scrollHeight,clientHeight:e?.clientHeight,mountedRows:e?.querySelectorAll('[role=row]').length}; })()",
  );
  const result = response?.result;
  if (
    result?.coverage !== "complete" ||
    result?.collected_count !== 1000 ||
    result?.restored_position !== true ||
    result?.records?.length !== 200 ||
    typeof result?.next_cursor !== "string"
  )
    throw new Error(
      `virtual collection result mismatch metrics=${JSON.stringify(scrollMetrics)}: ${JSON.stringify(response)}`,
    );
  const scrollTop = scrollMetrics.scrollTop;
  if (scrollTop !== 0)
    throw new Error(`virtual grid was not restored: ${scrollTop}`);
  console.log(
    "Chrome virtual-grid collection read passed: 1,000 rows, EOF, chunk, restore",
  );

  const refreshedDiscover = await panelRequest({ kind: "COLLECTION_DISCOVER" });
  const refreshedGrid = refreshedDiscover?.collections?.find(
    (item) => item.object_kind === "grid" && item.has_virtual_scroll === true,
  );
  if (!refreshedGrid)
    throw new Error(
      `virtual grid was not rediscovered: ${JSON.stringify(refreshedDiscover)}`,
    );
  const startPayload = {
    kind: "PANEL_REQUEST",
    window_id: panelWindowId,
    payload: {
      kind: "COLLECTION_READ_START",
      request: { collection_ref: refreshedGrid.collection_ref, mode: "full" },
    },
  };
  await cdp(panel.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: `window.__stopReadPromise = chrome.runtime.sendMessage(${JSON.stringify(startPayload)}); setTimeout(() => chrome.runtime.sendMessage(${JSON.stringify({ kind: "PANEL_REQUEST", window_id: panelWindowId, payload: { kind: "COLLECTION_READ_CANCEL" } })}), 100)`,
    awaitPromise: false,
    returnByValue: true,
  });
  const stopped = await evaluate(panel, "window.__stopReadPromise");
  const fixturePage = (
    await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json())
  ).find((target) => target.id === fixtureTarget.targetId);
  const restoredMetrics = await evaluate(
    fixturePage,
    "document.querySelector('#gridContainer')?.scrollTop",
  );
  if (
    stopped?.result?.coverage !== "partial" ||
    stopped?.result?.reason !== "CANCELLED" ||
    stopped?.result?.collected_count <= 0 ||
    stopped?.result?.restored_position !== true ||
    restoredMetrics !== 0
  )
    throw new Error(
      `stopped collection result mismatch metrics=${restoredMetrics}: ${JSON.stringify(stopped)}`,
    );
  console.log(
    `Chrome virtual-grid stop passed: partial result with ${stopped.result.collected_count} rows, scroll restored`,
  );
} finally {
  child?.kill("SIGTERM");
  if (child)
    await new Promise((resolveClose) => child.once("close", resolveClose));
  if (fixture) await new Promise((resolveClose) => fixture.close(resolveClose));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  await rm(certificateDirectory, {
    recursive: true,
    force: true,
    maxRetries: 3,
  });
}
