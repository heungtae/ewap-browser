import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { uninstallRelease } from "../../../dist/s36/installation.mjs";
import { evaluate, waitFor } from "../../chrome-cdp-utils.mjs";
import { verifyReadback } from "./chrome-readback.mjs";
import { prepareTransfer } from "./chrome-setup.mjs";
export async function qualifyNative({ profile, extensionId, worker, panel }) {
  const input = {
    directory: `${profile}/agent`,
    registry: `${profile}/NativeMessagingHosts`,
    extensionId,
    releaseDirectory: process.env.S36_INSTALL_RELEASE_DIR,
    releaseId: process.env.S36_INSTALL_RELEASE_ID,
  };
  const all = process.env.S36_INSTALLED_ALL === "1";
  const checkpoints = process.env.S36_PUBLISH_CHECKPOINTS === "1";
  if (checkpoints && !all) throw new Error("CHECKPOINTS_REQUIRE_ALL_UNITS");
  const joint = process.env.S36_INSTALLED_JOINT === "1";
  const mode = process.env.S36_SETTINGS_MODE ?? "session-only";
  if (!["session-only", "os-store"].includes(mode))
    throw new Error("SETTINGS_MODE");
  const installed = process.env.S36_INSTALLED_MG01 === "1";
  if (mode === "os-store" && !installed)
    throw new Error("OS_REQUIRES_PACKAGED_MODE");
  const { prepared, config, dbPath } = await prepareTransfer(
    input,
    panel,
    mode,
  );
  const launch = () => {
    const child = spawn(
      process.execPath,
      installed
        ? [
            resolve(
              input.releaseDirectory,
              "agent-server/migration-daemon.mjs",
            ),
            input.releaseId,
            prepared.configPath,
            `--settings-${mode}`,
            "--installed",
          ]
        : [
            resolve("scripts/s36/transport/daemon.mjs"),
            prepared.configPath,
            "--settings-session-only",
          ],
      { stdio: "ignore" },
    );
    return { child, closed: new Promise((r) => child.once("close", r)) };
  };
  let daemon = launch();
  try {
    await waitFor(
      () =>
        access(config.socketPath)
          .then(() => true)
          .catch(() => false),
      4000,
      "RPC_SOCKET",
    );
    await evaluate(
      worker,
      `chrome.storage.session.set({s28Pairing:${JSON.stringify({ installationId: config.installationId, profileId: config.profileId, secret: config.secret })}}).then(()=>true)`,
    );
    await waitFor(
      async () => {
        try {
          return await evaluate(panel, "S36Settings.ready()");
        } catch {
          return undefined;
        }
      },
      7000,
      "RPC_READY",
    );
    const first = await evaluate(panel, "S36Settings.stage()");
    assert.equal(first.copied, 1);
    assert.equal(first.quarantined, 0);
    if (joint) {
      assert.equal(await evaluate(panel, "S36Settings.stagePolicy()"), true);
      assert.equal(
        await evaluate(panel, "S36Settings.rejectPolicyDriftAndEpoch()"),
        true,
      );
    }

    if (all)
      assert.equal(await evaluate(panel, "S36Settings.stageOwner()"), true);
    if (checkpoints) {
      for (let attempt = 0; attempt < 2; attempt++)
        assert.equal(
          (
            await evaluate(
              panel,
              "S36Settings.checkpointsClient().publish(S36Settings.ownerCandidate(),0)",
            )
          ).revision,
          1,
        );
    }
    daemon.child.kill("SIGTERM");
    await daemon.closed;
    daemon = launch();
    await waitFor(
      () =>
        access(config.socketPath)
          .then(() => true)
          .catch(() => false),
      4000,
      "RPC_RESTART_SOCKET",
    );
    await waitFor(
      async () => {
        try {
          return await evaluate(panel, "S36Settings.ready()");
        } catch {
          return undefined;
        }
      },
      7000,
      "MG01_RESTART_READY",
    );
    if (mode === "os-store") {
      assert.equal(
        await evaluate(panel, "S36Settings.validatePersisted()"),
        true,
      );
    } else {
      assert.equal(
        await evaluate(panel, "S36Settings.expectLostSession()"),
        true,
      );
      assert.equal((await evaluate(panel, "S36Settings.stage()")).copied, 1);
    }
    if (joint)
      assert.equal(await evaluate(panel, "S36Settings.validatePolicy()"), true);
    if (all) {
      if (checkpoints)
        assert.equal(
          (
            await evaluate(
              panel,
              "S36Settings.checkpointsClient().read(S36Settings.ownerCandidate().manifest,{migrationId:'wire',epoch:1,revision:1})",
            )
          ).phase,
          "copying",
        );
      assert.equal(await evaluate(panel, "S36Settings.reopenOwner()"), true);
      assert.equal(await evaluate(panel, "S36Settings.ownerNegatives()"), true);
    }
    assert.equal(await evaluate(panel, "S36Settings.revoked()"), true);
    assert.equal(await evaluate(panel, "globalThis.s36CspViolations"), 0);
    daemon.child.kill("SIGTERM");
    await daemon.closed;
    verifyReadback(dbPath, joint, checkpoints);
    uninstallRelease(input);
    return {
      result: "PASS",
      actualChromeSettingsToSqlite: true,
      cspViolations: 0,
      authenticatedNativeMessaging: true,
      credentialMode: mode,
      sixUnitBrowserReadbackVerified: all,
      browserOwnerAckReopenVerified: all,
      sourceBoundResumeCheckVerified: all,
      sixUnitBackendCheckpointPublication: checkpoints,
      checkpointDuplicateAndRestartReadback: checkpoints,
      missingUnitProfileAndExpiryRejected: all,
      globalCommit: false,
      backendPhase: checkpoints ? "copying" : "prepared",
      jointPolicyRestartVerified: joint,
      policySourceDriftAndEpochRejected: joint,
      installedStartVerified: installed,
      sessionLossRejected: mode === "session-only",
      explicitReimportVerified: mode === "session-only",
      osRestartReadbackVerified: mode === "os-store",
      sourceUnchanged: true,
      revokedSourceBlocked: true,
      admission: false,
      taskReady: false,
      seedAndFreeze:
        "controlled source assertion; no installed source-writer freeze",
      registration: "isolated profile",
    };
  } finally {
    daemon.child.kill("SIGTERM");
    await daemon.closed;
  }
}
