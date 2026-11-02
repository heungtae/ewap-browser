import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { install } from "./install.mjs";
import { evaluate, waitFor } from "../chrome-cdp-utils.mjs";
import { qualifyAdvisory } from "./chrome-advisory.mjs";
import { qualifySettings } from "./chrome-settings.mjs";
import { qualifyPanelOwner } from "./chrome-owner.mjs";
import { qualifySidePanel } from "./chrome-sidepanel.mjs";
import { qualifyMultiplePanels } from "./chrome-multiwindow.mjs";
export async function qualifyNative({
  profile,
  browserCommand,
  extensionId,
  worker,
  panel,
  targets,
  output,
}) {
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
    for (const [path, allowed] of [
      ["sidepanel/index.html?untrusted=1", false],
      ["settings/index.html#agent", true],
      ["settings/learned-profiles.html", true],
    ]) {
      const tabId = await evaluate(
        worker,
        `chrome.tabs.create({url:chrome.runtime.getURL(${JSON.stringify(path)}),active:false}).then(tab=>tab.id)`,
      );
      try {
        const page = await waitFor(
          async () => (await targets()).find((item) => item.url.endsWith(path)),
          5000,
          "UI_CONTEXT_READY",
        );
        await waitFor(
          () => evaluate(page, "document.readyState === 'complete'"),
          5000,
          "UI_CONTEXT_DOCUMENT",
        );
        const result = await evaluate(
          page,
          "chrome.runtime.sendMessage({kind:'capabilities'})",
        );
        assert.equal(result?.ok, allowed, JSON.stringify({ path, result }));
      } finally {
        await evaluate(
          worker,
          `chrome.tabs.remove(${Number(tabId)}).then(()=>true)`,
        );
      }
    }
    const { target: sidePanel, ...sidePanelEvidence } = await qualifySidePanel({
      panel,
      targets,
      worker,
    });
    const multiplePanelEvidence = await qualifyMultiplePanels({
      panel,
      sidePanel,
      targets,
      worker,
    });
    const resume = await evaluate(
      panel,
      "chrome.runtime.sendMessage({kind:'resumeEvents',afterSequence:0})",
    );
    assert.equal(resume.ok, true);
    assert.equal(resume.result.cursor, 0);
    assert.equal(resume.result.snapshot.schema, "wca.connection-snapshot/v1");
    await waitFor(
      () =>
        evaluate(
          panel,
          "document.querySelector('#status')?.textContent==='Backend connected — controller setup required'",
        ),
      5000,
      "CONNECTED_PRESENTATION",
    );
    const count = await evaluate(
      panel,
      "document.querySelectorAll('#chat-messages .message').length",
    );
    const advisoryEvidence = await qualifyAdvisory({
      worker,
      targets,
      output,
      panel,
    });
    const settingsEvidence = await qualifySettings({
      worker,
      panel,
      targets,
      configPath: prepared.configPath,
      output,
    });
    daemon.child.kill("SIGTERM");
    await daemon.closed;
    const unavailable = await evaluate(
      panel,
      "chrome.runtime.sendMessage({kind:'capabilities'})",
    );
    assert.equal(unavailable.ok, false);
    await waitFor(
      () =>
        evaluate(
          panel,
          "document.querySelector('#status')?.textContent?.includes('disconnected')",
        ),
      5000,
      "DISCONNECTED_PRESENTATION",
    );
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
    assert.notEqual(resumed.result.streamId, resume.result.streamId);
    await waitFor(
      () =>
        evaluate(
          panel,
          "document.querySelector('#status')?.textContent==='Backend connected — controller setup required'",
        ),
      7000,
      "SNAPSHOT_PRESENTATION_RECOVERED",
    );
    assert.equal(
      await evaluate(
        panel,
        "document.querySelectorAll('#chat-messages .message').length",
      ),
      count,
    );
    const settingsRestart = await settingsEvidence.afterRestart();
    const ownerEvidence = await qualifyPanelOwner({
      panel,
      worker,
      targets,
      browserCommand,
    });
    return {
      ...ownerEvidence,
      advisoryManagement: advisoryEvidence,
      providerSettings: { ...settingsEvidence.before, ...settingsRestart },
      connectionSnapshotRecovered: true,
      uiReconnectWithoutDuplicateMessages: true,
      restartReconnect: true,
      result: "PASS",
      registration: "isolated profile",
      nativeHandshake: true,
      foreignDocumentDenied: true,
      settingsAndProfilesAllowed: true,
      actualSidePanelAllowed: true,
      sidePanelWindowId: -1,
      sidePanelMigrationDenied: true,
      ...sidePanelEvidence,
      ...multiplePanelEvidence,
      taskReady: false,
    };
  } finally {
    daemon.child.kill("SIGTERM");
    await daemon.closed;
  }
}
