import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { git } from "../../s26-inventory.mjs";
import { reservePort, waitFor, cdp } from "../../chrome-cdp-utils.mjs";
import { verifyReleaseSet } from "../../../dist/s36/release-set.mjs";
import { continuity } from "./continuity.mjs";
import { qualifyNative } from "./native-cases.mjs";
const executable = process.env.CHROME_FOR_TESTING_BIN;
const directory = process.env.S36_INSTALL_RELEASE_DIR;
const releaseId = process.env.S36_INSTALL_RELEASE_ID;
if (!executable || !directory || !releaseId)
  throw new Error("CHROME_AND_PINNED_RELEASE_REQUIRED");
verifyReleaseSet(directory, releaseId);
if (process.env.S36_UPGRADE_RELEASE_DIR && process.env.S36_UPGRADE_RELEASE_ID)
  verifyReleaseSet(
    process.env.S36_UPGRADE_RELEASE_DIR,
    process.env.S36_UPGRADE_RELEASE_ID,
  );
const profile = await mkdtemp(`${tmpdir()}/s36-host-`);
const extension = resolve(directory, "chrome-extension");
const port = await reservePort();
const child = spawn(
  executable,
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
const closed = new Promise((r) => child.once("close", r));
const deadline = setTimeout(() => child.kill("SIGKILL"), 50000);
try {
  const targets = () =>
    fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const worker = await waitFor(
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
    15000,
    "WORKER_READY",
  );
  const extensionId = new URL(worker.url).host;
  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then(
    (r) => r.json(),
  );
  const created = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    { url: `chrome-extension://${extensionId}/sidepanel/index.html` },
  );
  const panel = await waitFor(
    async () => (await targets()).find((t) => t.id === created.targetId),
    5000,
    "PANEL_READY",
  );
  await mkdir(process.env.S36_INSTALL_EVIDENCE_DIR, { recursive: true });
  await cdp(panel.webSocketDebuggerUrl, "Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const result = await qualifyNative({ profile, extensionId, worker, panel });
  assert.equal(result.result, "PASS");
  const presentation = await continuity({
    panel,
    browser: version,
    extensionId,
    port,
    output: process.env.S36_INSTALL_EVIDENCE_DIR,
  });
  const report = {
    presentation,
    revision: git("rev-parse", "HEAD").trim(),
    worktreeDirty: Boolean(git("status", "--porcelain").trim()),
    browser: version.Browser,
    platform: process.platform,
    node: process.versions.node,
    releaseId,
    ...result,
    businessDispatches: 0,
    providerCalls: 0,
    approvals: 0,
    scope: "isolated Linux S28 presentation recovery; no task admission",
  };
  const output =
    process.env.S36_INSTALL_EVIDENCE_DIR ?? "dist/s36/presentation-chrome";
  await mkdir(output, { recursive: true });
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  clearTimeout(deadline);
  child.kill("SIGTERM");
  await closed;
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
