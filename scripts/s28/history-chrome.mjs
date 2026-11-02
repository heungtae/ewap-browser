import { prepareHistoryExtension } from "./history-extension.mjs";
import { historyPanelCases } from "./history-panel-cases.mjs";
import { historyLossCases } from "./history-loss-cases.mjs";
import { historyReport } from "./history-report.mjs";
import { spawn } from "node:child_process";
import { cp, access, mkdtemp, readFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { install } from "./install.mjs";
import { reservePort, waitFor, evaluate } from "../chrome-cdp-utils.mjs";
const chromeBin = process.env.CHROME_FOR_TESTING_BIN,
  nodeBin = process.env.S28_SQLITE_NODE;
if (!chromeBin || !nodeBin)
  throw Error("CHROME_FOR_TESTING_BIN and S28_SQLITE_NODE required");
const root = await mkdtemp(`${tmpdir()}/s28-history-chrome-`),
  extension = `${root}/extension`,
  profile = `${root}/chrome`;
await prepareHistoryExtension(extension);
const port = await reservePort();
const chrome = spawn(
  chromeBin,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    `--load-extension=${extension}`,
    `--disable-extensions-except=${extension}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
const closed = new Promise((r) => chrome.once("close", r)),
  timeout = setTimeout(() => chrome.kill("SIGKILL"), 55000);
let daemon;
try {
  const targets = () =>
    fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const getWorker = () =>
    waitFor(
      async () => {
        try {
          return (await targets()).find(
            (t) =>
              t.type === "service_worker" &&
              t.url.endsWith("/js/service-worker.js"),
          );
        } catch {
          return undefined;
        }
      },
      10000,
      "HISTORY_WORKER",
    );
  let worker = await getWorker();
  const extensionId = new URL(worker.url).host;
  const prepared = await install({
    directory: `${root}/agent`,
    extensionId,
    executable: process.execPath,
    dryRun: false,
  });
  const config = JSON.parse(await readFile(prepared.configPath, "utf8"));
  await mkdir(`${profile}/NativeMessagingHosts`, {
    recursive: true,
    mode: 0o700,
  });
  await cp(
    `${root}/agent/host-registration.json`,
    `${profile}/NativeMessagingHosts/ai.contextpilot.agent.json`,
  );
  const reportPath = `${root}/daemon.json`;
  const launch = () => {
    const child = spawn(
      nodeBin,
      [
        resolve("scripts/s28/history-daemon.mjs"),
        prepared.configPath,
        reportPath,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    return { child, closed: new Promise((r) => child.once("close", r)) };
  };
  const observedRead = () =>
    readFile(reportPath + ".read", "utf8")
      .then(JSON.parse)
      .catch(() => undefined);
  const source = () =>
    readFile(reportPath, "utf8")
      .then(JSON.parse)
      .catch(() => undefined);
  daemon = launch();
  const ready = await waitFor(
    async () => {
      const r = await source();
      return r?.state === "READY" && r;
    },
    5000,
    "HISTORY_DAEMON",
  );
  await evaluate(
    worker,
    `chrome.storage.session.set({s28Pairing:${JSON.stringify({ installationId: config.installationId, profileId: config.profileId, secret: config.secret })}, historyFixtureTask:${JSON.stringify(ready.taskId)}}).then(()=>true)`,
  );
  const tab = await evaluate(
    worker,
    "chrome.tabs.create({url:chrome.runtime.getURL('sidepanel/index.html'),active:true}).then(t=>({id:t.id,windowId:t.windowId}))",
  );
  await evaluate(
    worker,
    `chrome.storage.session.set({historyFixtureTab:${JSON.stringify(tab)}}).then(()=>true)`,
  );
  const panel = await waitFor(
    async () =>
      (await targets()).find((t) => t.url.endsWith("/sidepanel/index.html")),
    5000,
    "HISTORY_PANEL",
  );
  const one = await historyPanelCases({
    worker,
    panel,
    targets,
    reportPath,
    source,
    taskId: ready.taskId,
  });
  const restartDaemon = async () => {
    daemon.child.kill("SIGTERM");
    await daemon.closed;
    await rm(reportPath);
    daemon = launch();
    await waitFor(
      () =>
        access(config.socketPath).then(
          () => true,
          () => false,
        ),
      5000,
      "RESTART_SOCKET",
    );
  };
  const loss = await historyLossCases({
    worker,
    panel,
    targets,
    port,
    source,
    observedRead,
    reportPath,
    one,
    restartDaemon,
  });
  await historyReport(panel, loss);
} finally {
  clearTimeout(timeout);
  daemon?.child.kill("SIGTERM");
  if (daemon) await daemon.closed;
  chrome.kill("SIGTERM");
  await closed;
  await rm(root, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
