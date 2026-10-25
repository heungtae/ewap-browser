import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  rm,
  readFile,
  writeFile,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { git } from "../../s26-inventory.mjs";
import { evaluate, waitFor } from "../../chrome-cdp-utils.mjs";
import { verifyReleaseSet } from "../../../dist/s36/release-set.mjs";
import { uninstallRelease } from "../../../dist/s36/installation.mjs";
import { migrationProfileGuard } from "../../../dist/s36/transport.mjs";
import { openChrome } from "./chrome-process.mjs";
import { prepareTransfer, injectSettings } from "./chrome-setup.mjs";
import { verifyReadback } from "./chrome-readback.mjs";
const directory = process.env.S36_INSTALL_RELEASE_DIR,
  releaseId = process.env.S36_INSTALL_RELEASE_ID;
if (!process.env.CHROME_FOR_TESTING_BIN || !directory || !releaseId)
  throw new Error("CHROME_AND_PINNED_RELEASE_REQUIRED");
verifyReleaseSet(directory, releaseId);
const profile = await mkdtemp(`${tmpdir()}/s36-browser-restart-`);
const mode = process.env.S36_SETTINGS_MODE;
let chrome, daemon, daemonClosed;
try {
  chrome = await openChrome(profile);
  const input = {
    directory: `${profile}/agent`,
    registry: `${profile}/NativeMessagingHosts`,
    extensionId: chrome.extensionId,
    releaseDirectory: directory,
    releaseId,
  };
  const { prepared, config, dbPath } = await prepareTransfer(
    input,
    chrome.panel,
    mode,
  );
  const pairing = await readFile(prepared.configPath, "utf8");
  const profileGuard = await migrationProfileGuard(
    config.installationId,
    config.profileId,
  );
  daemon = spawn(
    process.execPath,
    [
      resolve(directory, "agent-server/migration-daemon.mjs"),
      releaseId,
      prepared.configPath,
      `--settings-${mode}`,
      "--installed",
    ],
    { stdio: "ignore" },
  );
  daemonClosed = new Promise((resolve) => daemon.once("close", resolve));
  await waitFor(
    () =>
      access(config.socketPath)
        .then(() => true)
        .catch(() => false),
    4000,
    "DAEMON_READY",
  );
  const pair = async () => {
    await evaluate(
      chrome.worker,
      `chrome.storage.session.set({s28Pairing:${JSON.stringify({ installationId: config.installationId, profileId: config.profileId, secret: config.secret })}}).then(()=>true)`,
    );
    await waitFor(
      async () => {
        try {
          return await evaluate(chrome.panel, "S36Settings.ready()");
        } catch {
          return undefined;
        }
      },
      7000,
      "RPC_READY",
    );
  };
  await pair();
  assert.equal((await evaluate(chrome.panel, "S36Settings.stage()")).copied, 1);
  assert.equal(await evaluate(chrome.panel, "S36Settings.stagePolicy()"), true);
  assert.equal(await evaluate(chrome.panel, "S36Settings.stageOwner()"), true);
  const candidate = await evaluate(
    chrome.panel,
    "S36Settings.ownerCandidate()",
  );
  assert.doesNotMatch(
    JSON.stringify(candidate),
    /PRIVATE_API_CANARY|PRIVATE_HEADER_CANARY/,
  );
  const previousPid = chrome.pid,
    version = chrome.browser;
  await chrome.stop();
  chrome = undefined;
  chrome = await openChrome(profile);
  assert.notEqual(chrome.pid, previousPid);
  assert.equal(chrome.extensionId, input.extensionId);
  const session = await evaluate(
    chrome.worker,
    "chrome.storage.session.get(['s28Pairing','chat_session_v1','execution_requests_v1','execution_diagnostics_v1'])",
  );
  assert.deepEqual(session, {});
  await injectSettings(chrome.panel);
  assert.equal(
    await evaluate(
      chrome.panel,
      `S36Settings.restoreAfterBrowserRestart(${JSON.stringify(profileGuard)},${JSON.stringify(mode)},${JSON.stringify(candidate)})`,
    ),
    true,
  );
  // Fresh trusted fixture pairing is explicit. Historical session grants are not restored.
  await pair();
  assert.equal(
    await evaluate(chrome.panel, "S36Settings.rejectLostSources()"),
    true,
  );
  assert.equal(
    await evaluate(chrome.panel, "S36Settings.validatePersisted()"),
    true,
  );
  assert.equal(
    await evaluate(chrome.panel, "S36Settings.validatePolicy()"),
    true,
  );
  assert.equal(await evaluate(chrome.panel, "globalThis.s36CspViolations"), 0);
  assert.equal(await readFile(prepared.configPath, "utf8"), pairing);
  daemon.kill("SIGTERM");
  await daemonClosed;
  verifyReadback(dbPath, true);
  uninstallRelease(input);
  const report = {
    result: "PASS",
    revision: git("rev-parse", "HEAD").trim(),
    worktreeDirty: Boolean(git("status", "--porcelain").trim()),
    browser: version,
    node: process.versions.node,
    releaseId,
    credentialMode: mode,
    actualBrowserProcessRestart: true,
    daemonKeptRunning: true,
    sessionSourceAndPairingLost: true,
    persistedBrowserAckObserved: true,
    lostSourceAckRejected: true,
    explicitFreshPairing: true,
    mg01AndPolicyReadbackVerified: true,
    cspViolations: 0,
    admission: false,
    namespace: "legacy",
    backendPhase: "prepared",
    globalCommit: false,
    providerCalls: 0,
    businessDispatches: 0,
    approvals: 0,
    sourceFreeze: "controlled assertion",
    scope:
      "browser restart rejects old ACK after session source loss; no source rehydration/global commit",
  };
  const output =
    process.env.S36_INSTALL_EVIDENCE_DIR ?? "dist/s36/browser-restart";
  await mkdir(output, { recursive: true });
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  daemon?.kill("SIGTERM");
  if (daemonClosed) await daemonClosed;
  await chrome?.stop();
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
