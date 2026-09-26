/** S8 Chrome evidence: Settings modes through real Side Panel Act approval. */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openAnalysisPanel } from "./chrome-analysis-panel.mjs";
import { cdp, evaluate, reservePort, waitFor } from "./chrome-cdp-utils.mjs";
import { createS7Fixture } from "./chrome-s7-fixture.mjs";
import { checkS8 } from "./chrome-s8-check.mjs";

const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable) throw new Error("CHROME_FOR_TESTING_BIN is required");

const runCase = async (kind, modeOverride) => {
  const certificateDirectory = await mkdtemp(join(tmpdir(), "s7-cert-"));
  const profile = await mkdtemp(join(tmpdir(), "s7-profile-"));
  let fixtureData;
  let child;
  try {
    fixtureData = await createS7Fixture(certificateDirectory, kind);
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
      "S7_CHROME_NOT_READY",
    );
    const fixtureTarget = await cdp(
      version.webSocketDebuggerUrl,
      "Target.createTarget",
      { url: `https://s1.fixture.test:${fixtureData.fixturePort}/` },
    );
    const targets = () =>
      fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) =>
        response.json(),
      );
    const worker = await waitFor(
      async () =>
        (await targets()).find(
          (target) =>
            target.type === "service_worker" &&
            target.url.endsWith("/js/service-worker.js"),
        ),
      10_000,
      "S7_WORKER_NOT_READY",
    );
    const extensionId = new URL(worker.url).host;
    const { panel } = await openAnalysisPanel({
      cdpPort,
      extensionId,
      fixtureTarget,
      version,
      worker,
    });
    const page = await waitFor(
      async () =>
        (await targets()).find((item) => item.id === fixtureTarget.targetId),
      10_000,
      "S7_PAGE_NOT_READY",
    );
    const tabId = await evaluate(
      panel,
      "chrome.tabs.query({active:true,lastFocusedWindow:true}).then(tabs=>tabs[0]?.id)",
    );
    if (!Number.isInteger(tabId)) throw new Error("S7_TAB_NOT_BOUND");
    return await checkS8({
      panel,
      page,
      tabId,
      fixtureData,
      kind,
      modeOverride,
      cdpPort,
      version,
      extensionId,
      fixtureTarget,
    });
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
};

const skipped = await runCase("case");
const planned = await runCase("invoice");
const skippedR2 = await runCase("invoice", "skip_all_permission_checks");
console.log(
  `S8 Chrome passed: skip R1/R2, standard reset, stored deny, follow-plan R2 and expired plan; provider calls=${skipped.providerCalls + planned.providerCalls + skippedR2.providerCalls}`,
);
