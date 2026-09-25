/** S3 Chrome evidence: core Provider auth, streaming, Stop, plugin disable. */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openAnalysisPanel } from "./chrome-analysis-panel.mjs";
import { cdp, reservePort, waitFor } from "./chrome-cdp-utils.mjs";
import { checkS3 } from "./chrome-s3-check.mjs";
import { createS3Fixture } from "./chrome-s3-fixture.mjs";

const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable)
  throw new Error("CHROME_FOR_TESTING_BIN must point to Chrome for Testing");
const certificateDirectory = await mkdtemp(join(tmpdir(), "s3-cert-"));
const profile = await mkdtemp(join(tmpdir(), "s3-profile-"));
let fixtureData;
let child;
try {
  fixtureData = await createS3Fixture(certificateDirectory);
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
    "S3_CHROME_NOT_READY",
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
    "S3_WORKER_NOT_LOADED",
  );
  const extensionId = new URL(worker.url).host;
  const { panel, panelWindowId } = await openAnalysisPanel({
    cdpPort,
    extensionId,
    fixtureTarget,
    version,
    worker,
  });
  const result = await checkS3({
    panel,
    panelWindowId,
    fixturePort,
    fixtureData,
  });
  console.log(
    `S3 Chrome passed: core auth headers, chat/responses SSE, plugin disable, secret redaction, Stop; turns=${result.turns}`,
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
