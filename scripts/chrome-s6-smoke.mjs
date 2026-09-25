/** S6 Chrome evidence: real Ask read tools and transient visual capture. */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openAnalysisPanel } from "./chrome-analysis-panel.mjs";
import { cdp, evaluate, reservePort, waitFor } from "./chrome-cdp-utils.mjs";
import { createS6Fixture } from "./chrome-s6-fixture.mjs";
import { checkS6 } from "./chrome-s6-check.mjs";

const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable) throw new Error("CHROME_FOR_TESTING_BIN is required");
const certificateDirectory = await mkdtemp(join(tmpdir(), "s6-cert-"));
const profile = await mkdtemp(join(tmpdir(), "s6-profile-"));
let fixtureData;
let child;
try {
  fixtureData = await createS6Fixture(certificateDirectory);
  const cdpPort = await reservePort();
  const chromeArgs = [
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
  ];
  const startChrome = async () => {
    child = spawn(executable, chromeArgs, { stdio: "ignore" });
    return waitFor(
      () =>
        fetch(`http://127.0.0.1:${cdpPort}/json/version`)
          .then((response) => response.json())
          .catch(() => undefined),
      10_000,
      "S6_CHROME_NOT_READY",
    );
  };
  let version = await startChrome();
  const targets = () =>
    fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) =>
      response.json(),
    );
  let worker = await waitFor(
    async () =>
      (await targets()).find(
        (target) =>
          target.type === "service_worker" &&
          target.url.endsWith("/js/service-worker.js"),
      ),
    10_000,
    "S6_WORKER_NOT_READY",
  );
  const extensionId = new URL(worker.url).host;
  const deniedTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    { url: `https://s1.fixture.test:${fixtureData.fixturePort}/` },
  );
  await cdp(version.webSocketDebuggerUrl, "Target.activateTarget", {
    targetId: deniedTarget.targetId,
  });
  const deniedCapture = await cdp(
    worker.webSocketDebuggerUrl,
    "Runtime.evaluate",
    {
      expression:
        "chrome.permissions.contains({origins:['<all_urls>']}).then(async granted=>({granted,denied:await chrome.tabs.captureVisibleTab(undefined,{format:'jpeg'}).then(()=>false,()=>true)}))",
      awaitPromise: true,
      returnByValue: true,
    },
  );
  if (
    deniedCapture.result?.value?.granted !== false ||
    deniedCapture.result?.value?.denied !== true
  )
    throw new Error("S6_CAPTURE_WITHOUT_PERMISSION_NOT_DENIED");
  child.kill("SIGTERM");
  await new Promise((resolveClose) => child.once("close", resolveClose));
  child = undefined;
  const preferencesPath = join(profile, "Default/Preferences");
  const preferences = JSON.parse(await readFile(preferencesPath, "utf8"));
  const extension = preferences.extensions?.settings?.[extensionId];
  if (!extension?.granted_permissions || !extension?.active_permissions)
    throw new Error("S6_EXTENSION_PREFERENCES_MISSING");
  for (const state of [
    extension.granted_permissions,
    extension.active_permissions,
  ])
    state.explicit_host = [...new Set([...state.explicit_host, "<all_urls>"])];
  await writeFile(preferencesPath, JSON.stringify(preferences));
  version = await startChrome();
  const fixtureTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    {
      url: `https://s1.fixture.test:${fixtureData.fixturePort}/?auth=S6_URL_SECRET#S6_FRAGMENT_SECRET`,
    },
  );
  worker = await waitFor(
    async () =>
      (await targets()).find(
        (target) =>
          target.type === "service_worker" &&
          target.url.endsWith("/js/service-worker.js"),
      ),
    10_000,
    "S6_WORKER_NOT_READY",
  );
  if (new URL(worker.url).host !== extensionId)
    throw new Error("S6_EXTENSION_ID_CHANGED");
  const { panel } = await openAnalysisPanel({
    cdpPort,
    extensionId,
    fixtureTarget,
    version,
    worker,
  });
  const result = await checkS6({ panel, fixtureData });
  const settingsTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    { url: `chrome-extension://${extensionId}/settings/index.html` },
  );
  const settings = await waitFor(
    async () =>
      (await targets()).find((target) => target.id === settingsTarget.targetId),
    10_000,
    "S6_SETTINGS_NOT_READY",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#screenshot-permission-request')?.disabled && document.querySelector('#screenshot-permission-status')?.value.includes('전체 사이트 접근이 허용되었습니다')",
      ),
    10_000,
    "S6_SCREENSHOT_PERMISSION_NOT_SHOWN",
  );
  console.log(
    `S6 Chrome passed: Ask read/find/batch/tabs/screenshot/zoom; no-grant capture denied; provider calls=${result.calls}, timeline tools=${result.tools}`,
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
