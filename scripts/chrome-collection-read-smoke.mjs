import { spawn, execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:https";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

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
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--ignore-certificate-errors",
      "--host-resolver-rules=MAP collection.fixture.test 127.0.0.1",
      `--user-data-dir=${profile}`,
      `--disable-extensions-except=${resolve("dist-extension")}`,
      `--load-extension=${resolve("dist-extension")}`,
      `--remote-debugging-port=${cdpPort}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const version = await waitFor(
    async () =>
      fetch(`http://127.0.0.1:${cdpPort}/json/version`)
        .then((r) => r.json())
        .catch(() => undefined),
    10_000,
    "Chrome for Testing did not open CDP",
  );
  const fixtureTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    { url: `https://collection.fixture.test:${fixturePort}/` },
  );
  const worker = await waitFor(
    async () => {
      const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
        (r) => r.json(),
      );
      return targets.find(
        (target) =>
          target.type === "service_worker" &&
          target.url.endsWith("/js/service-worker.js"),
      );
    },
    10_000,
    "ContextPilot worker was not loaded",
  );
  const extensionId = new URL(worker.url).host;
  await cdp(version.webSocketDebuggerUrl, "Target.createTarget", {
    url: `chrome-extension://${extensionId}/sidepanel/index.html`,
  });
  let panel = await waitFor(
    async () => {
      const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
        (r) => r.json(),
      );
      return targets.find(
        (target) =>
          target.url ===
          `chrome-extension://${extensionId}/sidepanel/index.html`,
      );
    },
    10_000,
    "Side Panel target was not created",
  );
  await waitFor(
    () => evaluate(panel, "document.body instanceof HTMLBodyElement"),
    10_000,
    "Side Panel document did not load",
  );
  const openControl = await evaluate(
    panel,
    `(() => {
      const button = document.createElement('button');
      button.id = 'collection-smoke-open-panel';
      button.textContent = 'open';
      button.addEventListener('click', async () => {
        await chrome.sidePanel.open({windowId: (await chrome.windows.getCurrent()).id});
      });
      document.body.append(button);
      const rect = button.getBoundingClientRect();
      return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
    })()`,
  );
  await cdp(panel.webSocketDebuggerUrl, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: openControl.x,
    y: openControl.y,
    button: "left",
    clickCount: 1,
  });
  await cdp(panel.webSocketDebuggerUrl, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: openControl.x,
    y: openControl.y,
    button: "left",
    clickCount: 1,
  });
  await waitFor(
    () =>
      evaluate(
        worker,
        "chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}).then((items) => items.length === 1)",
      ),
    10_000,
    "Chrome did not open a real Side Panel context",
  );
  panel = await waitFor(
    async () => {
      const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
        (response) => response.json(),
      );
      return targets.find(
        (target) =>
          target.id !== panel.id &&
          target.url ===
            `chrome-extension://${extensionId}/sidepanel/index.html`,
      );
    },
    10_000,
    "real Side Panel DevTools target was not created",
  );
  await cdp(version.webSocketDebuggerUrl, "Target.activateTarget", {
    targetId: fixtureTarget.targetId,
  });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  const panelWindowId = await evaluate(
    panel,
    "chrome.windows.getCurrent().then(({id}) => id)",
  );
  if (!Number.isInteger(panelWindowId) || panelWindowId < 0)
    throw new Error("Side Panel has no authenticated window ID");
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
      decision: "once",
    });
    if (granted?.ok !== true)
      throw new Error("collection permission was not granted");
    response = await start(grid.collection_ref);
  }
  const result = response?.result;
  if (
    result?.coverage !== "complete" ||
    result?.collected_count !== 1000 ||
    result?.restored_position !== true ||
    result?.records?.length !== 200 ||
    typeof result?.next_cursor !== "string"
  )
    throw new Error(
      `virtual collection result mismatch: ${JSON.stringify(response)}`,
    );
  const scrollTop = await evaluate(
    {
      webSocketDebuggerUrl: (
        await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) =>
          r.json(),
        )
      ).find((target) => target.id === fixtureTarget.targetId)
        .webSocketDebuggerUrl,
    },
    "document.querySelector('#gridContainer')?.scrollTop",
  );
  if (scrollTop !== 0)
    throw new Error(`virtual grid was not restored: ${scrollTop}`);
  console.log(
    "Chrome virtual-grid collection read passed: 1,000 rows, EOF, chunk, restore",
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
