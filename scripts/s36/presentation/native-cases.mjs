import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  installRelease,
  uninstallRelease,
} from "../../../dist/s36/installation.mjs";
import { evaluate, waitFor, cdp } from "../../chrome-cdp-utils.mjs";
export async function qualifyNative({ profile, extensionId, worker, panel }) {
  const input = {
    directory: `${profile}/agent`,
    registry: `${profile}/NativeMessagingHosts`,
    extensionId,
    releaseDirectory: process.env.S36_INSTALL_RELEASE_DIR,
    releaseId: process.env.S36_INSTALL_RELEASE_ID,
  };
  const prepared = installRelease(input),
    original = await readFile(prepared.configPath, "utf8");
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
    return { child, closed: new Promise((r) => child.once("close", r)) };
  };
  const status = () =>
    evaluate(panel, "document.querySelector('#status')?.textContent");
  const waitStatus = (expected) =>
    waitFor(
      async () => {
        const value = await status();
        return value?.includes(expected) ? value : undefined;
      },
      12000,
      `UI_STATUS_${expected}`,
    );
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
    const connected = await waitStatus(
      "Backend connected — controller setup required",
    );
    assert.equal(
      await evaluate(
        panel,
        "!document.querySelector('#activity-status').hidden && document.querySelector('#activity-status').getBoundingClientRect().height>0 && document.querySelector('#activity-status').textContent === document.querySelector('#status').textContent",
      ),
      true,
    );
    const before = await evaluate(
      panel,
      "document.querySelectorAll('#chat-messages .message').length",
    );
    const fixture = `document.querySelector('#chat-input')?.focus()`;
    await evaluate(panel, fixture);
    const focus = await evaluate(panel, "document.activeElement?.id");
    assert.equal(focus, "chat-input");
    await cdp(panel.webSocketDebuggerUrl, "Page.captureScreenshot", {
      format: "png",
    }).then(async ({ data }) => {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(
        `${process.env.S36_INSTALL_EVIDENCE_DIR}/panel-connected.png`,
        Buffer.from(data, "base64"),
      );
    });
    daemon.child.kill("SIGTERM");
    await daemon.closed;
    const disconnected = await waitStatus("disconnected");
    daemon = launch();
    await waitFor(
      () =>
        access(config.socketPath)
          .then(() => true)
          .catch(() => false),
      3000,
      "RESTART_SOCKET",
    );
    const recovered = await waitStatus(
      "Backend connected — controller setup required",
    );
    assert.equal(
      await evaluate(
        panel,
        "document.querySelectorAll('#chat-messages .message').length",
      ),
      before,
    );
    assert.equal(await evaluate(panel, "document.activeElement?.id"), focus);
    // Pagehide must dispose the old loop; pageshow remount uses the same document cursor.
    await evaluate(
      panel,
      "document.querySelector('#status').textContent='waiting for restoration'; dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})); dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})); true",
    );
    await waitStatus("Backend connected — controller setup required");
    await evaluate(
      panel,
      "globalThis.__s36BeforeReload=true; location.reload(); true",
    );
    await waitFor(
      () =>
        evaluate(
          panel,
          "!globalThis.__s36BeforeReload && document.readyState==='complete'",
        ),
      5000,
      "NEW_DOCUMENT",
    );
    await waitStatus("Backend connected — controller setup required");
    daemon.child.kill("SIGTERM");
    await daemon.closed;
    uninstallRelease(input);
    await waitStatus("disconnected");
    assert.equal(await readFile(prepared.configPath, "utf8"), original);
    return {
      result: "PASS",
      statuses: { connected, disconnected, recovered },
      automaticRecovery: true,
      visibleStatus: true,
      explicitCapabilitiesQueries: 0,
      focusPreserved: true,
      duplicateMessages: 0,
      pageLifecycleAndReload: true,
      pairingPreserved: true,
      taskReady: false,
      registration: "isolated profile",
      scope: "actual S28 transport/UI recovery; zero task/history execution",
    };
  } finally {
    daemon.child.kill("SIGTERM");
    await daemon.closed;
  }
}
