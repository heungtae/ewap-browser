/**
 * Controlled S10 Page API execution evidence in the real Side Panel.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createS10Fixture } from "./chrome-s10-fixture.mjs";
import {
  prepareS10ReadHarness,
  checkS10Read,
} from "./chrome-s10-read-check.mjs";
import { checkS10Actions } from "./chrome-s10-actions.mjs";
import { openAnalysisPanel } from "./chrome-analysis-panel.mjs";
import { cdp, evaluate, reservePort, waitFor } from "./chrome-cdp-utils.mjs";

const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable)
  throw new Error("CHROME_FOR_TESTING_BIN must point to Chrome for Testing");

const certificateDirectory = await mkdtemp(
  join(tmpdir(), "contextpilot-analysis-cert-"),
);
const profile = await mkdtemp(join(tmpdir(), "contextpilot-analysis-profile-"));
const providerRequests = [];
const extensionDirectory = await mkdtemp(
  join(tmpdir(), "contextpilot-s10-extension-"),
);
let fixture;
let child;
try {
  await prepareS10ReadHarness(extensionDirectory);
  const fixtureServer = await createS10Fixture(
    certificateDirectory,
    providerRequests,
  );
  fixture = fixtureServer.fixture;
  const { fixturePort } = fixtureServer;

  const cdpPort = await reservePort();
  child = spawn(
    executable,
    [
      "--no-sandbox",
      "--ozone-platform=x11",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--ignore-certificate-errors",
      `--host-resolver-rules=MAP page-api-fixture.invalid:443 127.0.0.1:${fixturePort}`,
      `--user-data-dir=${profile}`,
      `--disable-extensions-except=${extensionDirectory}`,
      `--load-extension=${extensionDirectory}`,
      `--remote-debugging-port=${cdpPort}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const version = await waitFor(
    async () =>
      fetch(`http://127.0.0.1:${cdpPort}/json/version`)
        .then((response) => response.json())
        .catch(() => undefined),
    90_000,
    "Chrome for Testing did not open CDP",
  );
  const fixtureTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    {
      url: "https://page-api-fixture.invalid/variant",
    },
  );
  const fixturePage = await waitFor(
    async () => {
      const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
        (response) => response.json(),
      );
      return targets.find((target) => target.id === fixtureTarget.targetId);
    },
    10_000,
    "analysis fixture page target was not created",
  );
  const worker = await waitFor(
    async () => {
      const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
        (response) => response.json(),
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
  const { panel, panelWindowId } = await openAnalysisPanel({
    cdpPort,
    extensionId,
    fixtureTarget,
    version,
    worker,
  });
  await checkS10Actions({
    panel,
    panelWindowId,
    fixturePage,
    version,
    worker,
    cdpPort,
    captures: providerRequests,
  });
  await checkS10Read({ panel, page: fixturePage });
  console.log(
    "S10 Page API Chrome passed: approval/permission, VERIFIED, already satisfied, absent API, UNKNOWN, throw/timeout, Stop, scope, restart, no replay, redaction",
  );
} finally {
  child?.kill("SIGTERM");
  if (child)
    await new Promise((resolveClose) => child.once("close", resolveClose));
  if (fixture) await new Promise((resolveClose) => fixture.close(resolveClose));
  await rm(extensionDirectory, { recursive: true, force: true, maxRetries: 3 });
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  await rm(certificateDirectory, {
    recursive: true,
    force: true,
    maxRetries: 3,
  });
}
