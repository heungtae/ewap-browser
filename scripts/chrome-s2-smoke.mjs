/** S2 Chrome evidence: permission, R2, trusted click and CDP recovery. */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openAnalysisPanel } from "./chrome-analysis-panel.mjs";
import { cdp, evaluate, reservePort, waitFor } from "./chrome-cdp-utils.mjs";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import { s2Page } from "./chrome-s2-fixture.mjs";
import { checkS2Permissions } from "./chrome-s2-permissions.mjs";
import { checkS2Lifecycle } from "./chrome-s2-lifecycle.mjs";
import { checkS2TabClose } from "./chrome-s2-tab-close.mjs";
import { checkS2Stop } from "./chrome-s2-stop.mjs";
import { checkS2Redaction } from "./chrome-s2-redaction.mjs";

const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable)
  throw new Error("CHROME_FOR_TESTING_BIN must point to Chrome for Testing");
const certificateDirectory = await mkdtemp(join(tmpdir(), "s2-cert-"));
const profile = await mkdtemp(join(tmpdir(), "s2-profile-"));
let fixtureData;
let child;
try {
  fixtureData = await createS1Fixture(certificateDirectory, s2Page);
  const { fixturePort } = fixtureData;
  const cdpPort = await reservePort();
  child = spawn(
    executable,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--ignore-certificate-errors",
      "--host-resolver-rules=MAP s1.fixture.test 127.0.0.1",
      `--user-data-dir=${profile}`,
      `--disable-extensions-except=${resolve("dist-extension")}`,
      `--load-extension=${resolve("dist-extension")}`,
      `--remote-debugging-port=${cdpPort}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const version = await waitFor(
    () =>
      fetch(`http://127.0.0.1:${cdpPort}/json/version`)
        .then((response) => response.json())
        .catch(() => undefined),
    10_000,
    "S2_CHROME_NOT_READY",
  );
  const fixtureTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    { url: `https://s1.fixture.test:${fixturePort}/` },
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
    "S2_WORKER_NOT_LOADED",
  );
  const extensionId = new URL(worker.url).host;
  const { panel, panelWindowId } = await openAnalysisPanel({
    cdpPort,
    extensionId,
    fixtureTarget,
    version,
    worker,
  });
  const page = await waitFor(
    async () => {
      const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
        (response) => response.json(),
      );
      return targets.find((target) => target.id === fixtureTarget.targetId);
    },
    10_000,
    "S2_PAGE_MISSING",
  );
  const tabId = await evaluate(
    panel,
    "chrome.tabs.query({active:true,lastFocusedWindow:true}).then(tabs => tabs[0].id)",
  );
  if (!Number.isInteger(tabId)) throw new Error("S2_TAB_NOT_BOUND");
  const { preview, attached } = await checkS2Permissions({
    panel,
    page,
    tabId,
  });
  await checkS2Stop({ panel, page, tabId, preview, attached });
  await checkS2Lifecycle({
    panel,
    page,
    tabId,
    fixturePort,
    firstPreview: preview,
    attached,
    version,
    worker,
    cdpPort,
  });
  await checkS2TabClose({ panel, fixturePort, version });
  await checkS2Redaction({ panel, panelWindowId, page });
  console.log(
    "S2 Chrome passed: permission, R2, trusted click/key/text, conflict, Stop, navigation, tab close, worker recovery, revoke",
  );
} finally {
  child?.kill("SIGTERM");
  if (child)
    await new Promise((resolveClose) => child.once("close", resolveClose));
  if (fixtureData)
    await new Promise((resolveClose) =>
      fixtureData.fixture.close(resolveClose),
    );
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  await rm(certificateDirectory, {
    recursive: true,
    force: true,
    maxRetries: 3,
  });
}
