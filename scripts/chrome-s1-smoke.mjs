/** S1 Chrome evidence: projection, signed Profile, Ask, sensitive data and scope. */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openAnalysisPanel } from "./chrome-analysis-panel.mjs";
import { cdp, reservePort, waitFor } from "./chrome-cdp-utils.mjs";
import { checkS1 } from "./chrome-s1-check.mjs";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";

const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable)
  throw new Error("CHROME_FOR_TESTING_BIN must point to Chrome for Testing");

const certificateDirectory = await mkdtemp(
  join(tmpdir(), "contextpilot-s1-cert-"),
);
const profile = await mkdtemp(join(tmpdir(), "contextpilot-s1-profile-"));
let fixtureData;
let child;
try {
  fixtureData = await createS1Fixture(certificateDirectory);
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
    "CHROME_CDP_NOT_READY",
  );
  const fixtureTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    {
      url: `https://s1.fixture.test:${fixturePort}/`,
    },
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
    "EXTENSION_WORKER_NOT_LOADED",
  );
  const extensionId = new URL(worker.url).host;
  const { panel, panelWindowId } = await openAnalysisPanel({
    cdpPort,
    extensionId,
    fixtureTarget,
    version,
    worker,
  });
  const fixturePage = await waitFor(
    async () => {
      const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
        (response) => response.json(),
      );
      return targets.find((target) => target.id === fixtureTarget.targetId);
    },
    10_000,
    "FIXTURE_PAGE_TARGET_MISSING",
  );
  const result = await checkS1({
    panel,
    panelWindowId,
    fixtureTarget: fixturePage,
    fixturePort,
    fixtureData,
    version,
    worker,
    cdpPort,
  });
  console.log(
    `S1 Chrome passed: real Side Panel, projection, JWS fail-closed, Ask, redaction, navigation, worker restart; resolver=${result.resolverRequests}, provider=${result.providerRequests}`,
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
