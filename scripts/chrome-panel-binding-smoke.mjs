import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";

const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable) {
  throw new Error(
    "CHROME_FOR_TESTING_BIN must point to a Chrome for Testing binary",
  );
}
const manifest = JSON.parse(
  await readFile("dist-extension/manifest.json", "utf8"),
);
const expectedWorker = `/${manifest.background.service_worker}`;
const port = await new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close();
    if (!address || typeof address === "string")
      reject(new Error("cannot reserve CDP port"));
    else resolvePort(address.port);
  });
});
const profile = await mkdtemp(join(tmpdir(), "webbrain-cft-profile-"));
const child = spawn(
  executable,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--user-data-dir=${profile}`,
    `--disable-extensions-except=${resolve("dist-extension")}`,
    `--load-extension=${resolve("dist-extension")}`,
    `--remote-debugging-port=${port}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
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
try {
  const deadline = Date.now() + 10_000;
  let workers = [];
  while (Date.now() < deadline) {
    try {
      const targets = await (
        await fetch(`http://127.0.0.1:${port}/json/list`)
      ).json();
      workers = targets.filter((target) => target.type === "service_worker");
      if (workers.some((worker) => worker.url.endsWith(expectedWorker))) break;
    } catch {
      // Chrome has not opened the DevTools endpoint yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  if (!workers.some((worker) => worker.url.endsWith(expectedWorker))) {
    throw new Error(
      "ContextPilot service worker was not loaded by Chrome for Testing",
    );
  }
  const worker = workers.find((item) => item.url.endsWith(expectedWorker));
  const extensionId = new URL(worker.url).host;
  const activeWindow = await cdp(
    worker.webSocketDebuggerUrl,
    "Runtime.evaluate",
    {
      expression:
        "chrome.tabs.query({active:true,lastFocusedWindow:true}).then(tabs => tabs[0].windowId)",
      awaitPromise: true,
      returnByValue: true,
    },
  );
  const browser = await (
    await fetch(`http://127.0.0.1:${port}/json/version`)
  ).json();
  const created = await cdp(
    browser.webSocketDebuggerUrl,
    "Target.createTarget",
    {
      url: `chrome-extension://${extensionId}/settings/index.html`,
    },
  );
  const targets = await (
    await fetch(`http://127.0.0.1:${port}/json/list`)
  ).json();
  const settings = targets.find((target) => target.id === created.targetId);
  const opened = await cdp(settings.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: `chrome.sidePanel.open({windowId:${activeWindow.result.value}}).then(() => true)`,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (opened.result?.value !== true) throw new Error(JSON.stringify(opened));
  await cdp(browser.webSocketDebuggerUrl, "Target.closeTarget", {
    targetId: created.targetId,
  });
  let panel;
  for (let attempt = 0; attempt < 50; attempt++) {
    const targets = await (
      await fetch(`http://127.0.0.1:${port}/json/list`)
    ).json();
    panel = targets.find(
      (target) =>
        target.url === `chrome-extension://${extensionId}/sidepanel/index.html`,
    );
    if (panel) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!panel) throw new Error("Real side panel did not open");
  const checked = await cdp(panel.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: `(async () => {
      const current = await chrome.windows.getCurrent();
      const contexts = await chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]});
      const request = {schema_version:1, kind:"CHAT_REQUEST_STATUS", request_id:crypto.randomUUID()};
      const reply = await chrome.runtime.sendMessage({kind:"PANEL_REQUEST", window_id:current.id, payload:request});
      return {contextWindowId:contexts[0]?.windowId, currentWindowId:current.id, code:reply.code};
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const result = checked.result?.value;
  // about:blank has no content script. Reaching this error proves that the
  // actual SIDE_PANEL sender passed binding and reached page registration.
  if (result?.code !== "DOCUMENT_NOT_REGISTERED")
    throw new Error(JSON.stringify(checked));
  console.log(JSON.stringify(result));
  console.log(
    "Real Chrome side panel passed window binding; page registration boundary verified.",
  );
} finally {
  child.kill("SIGTERM");
  await new Promise((resolveClose) => child.once("close", resolveClose));
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
}
