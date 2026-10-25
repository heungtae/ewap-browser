import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import {
  installRelease,
  uninstallRelease,
} from "../../../dist/s36/installation.mjs";
import { evaluate, waitFor } from "../../chrome-cdp-utils.mjs";
export async function qualifyNative({ profile, extensionId, worker, panel }) {
  const input = {
    directory: `${profile}/agent`,
    registry: `${profile}/NativeMessagingHosts`,
    extensionId,
    releaseDirectory: process.env.S36_INSTALL_RELEASE_DIR,
    releaseId: process.env.S36_INSTALL_RELEASE_ID,
  };
  const prepared = installRelease(input);
  const original = await readFile(prepared.configPath, "utf8");
  await rm(`${input.directory}/host.sh`);
  installRelease(input);
  assert.equal(await readFile(prepared.configPath, "utf8"), original);
  const config = JSON.parse(original);
  const launch = () => {
    const child = spawn(
      process.execPath,
      [
        resolve(input.releaseDirectory, "agent-server/launcher.cjs"),
        "daemon",
        prepared.configPath,
      ],
      { stdio: "ignore" },
    );
    const closed = new Promise((r) => child.once("close", r));
    return { child, closed };
  };
  let daemon = launch();
  try {
    await waitFor(
      () =>
        access(config.socketPath)
          .then(() => true)
          .catch(() => false),
      3000,
      "DAEMON_SOCKET",
    );
    await evaluate(
      worker,
      `chrome.storage.session.set({s28Pairing:${JSON.stringify({ installationId: config.installationId, profileId: config.profileId, secret: config.secret })}}).then(()=>true)`,
    );
    assert.throws(() => uninstallRelease(input), /INSTALL_BACKEND_ACTIVE/);
    const response = await evaluate(
      panel,
      "chrome.runtime.sendMessage({kind:'capabilities'})",
    );
    assert.equal(response?.ok, true, JSON.stringify(response));
    assert.equal(response.result.taskReady, false);
    assert.equal(response.result.health.state, "SESSION_ONLY");
    const resume = await evaluate(
      panel,
      "chrome.runtime.sendMessage({kind:'resumeEvents',afterSequence:0})",
    );
    assert.equal(resume.ok, true);
    assert.equal(resume.result.cursor, 0);
    daemon.child.kill("SIGTERM");
    await daemon.closed;
    const unavailable = await evaluate(
      panel,
      "chrome.runtime.sendMessage({kind:'capabilities'})",
    );
    assert.equal(unavailable.ok, false);
    daemon = launch();
    await waitFor(
      () =>
        access(config.socketPath)
          .then(() => true)
          .catch(() => false),
      3000,
      "DAEMON_RESTART_SOCKET",
    );
    const resumed = await waitFor(
      async () => {
        const response = await evaluate(
          panel,
          "chrome.runtime.sendMessage({kind:'resumeEvents',afterSequence:0})",
        );
        return response?.ok ? response : undefined;
      },
      7000,
      "NATIVE_RECONNECT",
    );
    assert.equal(resumed.result.cursor, 0);
    assert.equal(resumed.result.events.length, 0);
    daemon.child.kill("SIGTERM");
    await daemon.closed;
    const removed = uninstallRelease(input);
    assert.equal(removed.registered, false);
    assert.equal(await readFile(prepared.configPath, "utf8"), original);
    for (const path of [
      `${input.directory}/host.sh`,
      `${input.registry}/ai.contextpilot.agent.json`,
    ])
      await assert.rejects(access(path));
    const afterRemoval = await evaluate(
      panel,
      "chrome.runtime.sendMessage({kind:'capabilities'})",
    );
    assert.equal(afterRemoval.ok, false);
    return {
      installRepairRemove: true,
      pairingPreserved: true,
      activeRemovalBlocked: true,
      restartReconnect: true,
      result: "PASS",
      registration: "isolated profile",
      nativeHandshake: true,
      taskReady: false,
    };
  } finally {
    daemon.child.kill("SIGTERM");
    await daemon.closed;
  }
}
