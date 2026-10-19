import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import { openS19Chrome } from "./chrome-s19-harness.mjs";
import { capturePanelStates } from "./s26-panel-states.mjs";
import { checkOptionsNavigation } from "./chrome-options-navigation.mjs";
import assert from "node:assert/strict";
import { checkOptionsWorkflows } from "./chrome-options-workflows.mjs";
import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";
import { capture, captures, output } from "./s26-ui-capture.mjs";
const cert = await mkdtemp(join(tmpdir(), "contextpilot-s26-"));
let fixture, harness;
const checks = [];
const deadline = setTimeout(() => {
  console.error("S26_UI_DEADLINE: Chrome characterization exceeded 90 seconds");
  process.exit(2);
}, 90000);
deadline.unref();
try {
  fixture = await createS1Fixture(cert);
  harness = await openS19Chrome({
    executable: process.env.CHROME_FOR_TESTING_BIN,
    fixture,
  });
  await capture(harness.panel, "panel-idle");
  const open = async (path) => {
    const id = new URL(harness.panel.url).host;
    const t = await cdp(
      harness.version.webSocketDebuggerUrl,
      "Target.createTarget",
      { url: `chrome-extension://${id}/${path}` },
    );
    const origin = new URL(harness.version.webSocketDebuggerUrl);
    const target = {
      webSocketDebuggerUrl: `${origin.protocol}//${origin.host}/devtools/page/${t.targetId}`,
    };
    await waitFor(
      () => evaluate(target, "document.readyState==='complete'"),
      10000,
      "S26_UI_READY",
    );
    return target;
  };
  const settings = await open("settings/index.html");
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#provider-primary-select')?.value==='fixture'",
      ),
    10000,
    "S26_SETTINGS_READY",
  );
  await checkOptionsNavigation(settings, checks);
  for (const section of ["agent", "models", "automation", "enterprise"]) {
    await evaluate(settings, `location.hash=${JSON.stringify(section)}`);
    await capture(settings, `options-${section}`, 1440, 1100);
  }
  await evaluate(settings, "window.confirm=()=>false");
  const listed = await evaluate(
    settings,
    "chrome.runtime.sendMessage({kind:'LEARNED_PROFILE_MANAGE',operation:'list',limit:1})",
  );
  assert.equal(listed.ok, true);
  checks.push(
    "profile manager catalog available; popup-window characterization first failure retained separately",
  );
  await checkOptionsWorkflows(settings, checks);
  await capture(settings, "workflow-catalog", 1440, 1100);
  const manager = await open("settings/learned-profiles.html");
  await capture(manager, "profile-manager", 1100, 800);
  console.log("S26 Options and manager captured");
  await capturePanelStates(harness.panel);
  checks.push(
    "review/value clearing/confirmation/consent/Stop/dialog focus and Escape assertions",
  );
  await evaluate(
    harness.panel,
    "document.querySelector('#diagnostics-dialog').showModal()",
  );
  await capture(harness.panel, "diagnostics-dialog");
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        result: "PASS",
        scope:
          "controlled Linux Chrome presentation only; synthetic events do not establish dispatch or live model success",
        chrome: harness.version.Browser,
        checks,
        captures,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`S26 UI PASS: ${captures.length} captures`);
} catch (error) {
  await writeFile(
    "/tmp/s26-ui-first-failure.json",
    JSON.stringify(
      { result: "FAIL", reason: error.message, checks, captures },
      null,
      2,
    ),
  );
  throw error;
} finally {
  clearTimeout(deadline);
  await harness?.close();
  if (fixture) await new Promise((resolve) => fixture.fixture.close(resolve));
  await rm(cert, { recursive: true, force: true });
}
