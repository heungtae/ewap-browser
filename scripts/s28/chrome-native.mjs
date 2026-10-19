import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { install } from "./install.mjs";
import { evaluate, waitFor } from "../chrome-cdp-utils.mjs";
export async function qualifyNative({ profile, extensionId, worker, panel }) {
  const prepared = await install({
    directory: `${profile}/agent`,
    extensionId,
    executable: process.execPath,
    dryRun: false,
  });
  const config = JSON.parse(await readFile(prepared.configPath, "utf8"));
  const registry = `${profile}/NativeMessagingHosts`;
  await mkdir(registry, { recursive: true, mode: 0o700 });
  await copyFile(
    `${profile}/agent/host-registration.json`,
    `${registry}/ai.contextpilot.agent.json`,
  );
  const launch = () => {
    const child = spawn(
      process.execPath,
      [
        resolve("dist/s28/agent-server/launcher.cjs"),
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
    return {
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
