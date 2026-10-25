import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { access, chmod, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import {
  installRelease,
  uninstallRelease,
} from "../../../dist/s36/installation.mjs";
import {
  migrationProfileGuard,
  MigrationJournal,
} from "../../../dist/s36/transport.mjs";
import { evaluate, waitFor } from "../../chrome-cdp-utils.mjs";
export async function qualifyNative({ profile, extensionId, worker, panel }) {
  const input = {
    directory: `${profile}/agent`,
    registry: `${profile}/NativeMessagingHosts`,
    extensionId,
    releaseDirectory: process.env.S36_INSTALL_RELEASE_DIR,
    releaseId: process.env.S36_INSTALL_RELEASE_ID,
  };
  const prepared = installRelease(input),
    config = JSON.parse(await readFile(prepared.configPath, "utf8"));
  const profileGuard = await migrationProfileGuard(
    config.installationId,
    config.profileId,
  );
  const fixture = await build({
    entryPoints: ["extension/tests/fixture/s36/transport-chrome-cases.ts"],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    globalName: "S36Transport",
  });
  await evaluate(
    panel,
    "globalThis.s36CspViolations=0; addEventListener('securitypolicyviolation',()=>globalThis.s36CspViolations++); true",
  );
  await evaluate(panel, fixture.outputFiles[0].text);
  const preparation = await evaluate(
    panel,
    `S36Transport.prepare(${JSON.stringify(profileGuard)}).then(value=>({ok:true,...value})).catch(error=>({ok:false,error:error.message}))`,
  );
  assert.equal(preparation?.ok, true, preparation?.error);
  const { digest } = preparation;
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.match(profileGuard, /^[a-f0-9]{64}$/);
  const dbPath = `${input.directory}/migration.sqlite`;
  const db = new DatabaseSync(dbPath),
    journal = new MigrationJournal(db);
  const epoch = journal.fence();
  journal.write(undefined, {
    manifest: {
      migrationId: "wire",
      profileGuard,
      sourceSchemas: "controlled-source",
      targetSchemas: "controlled-target",
      legacyRelease: "legacy",
      targetRelease: "target",
      sourceDigests: Object.fromEntries(
        ["MG01", "MG02", "MG03", "MG04", "MG05", "MG06"].map((unit) => [
          unit,
          digest,
        ]),
      ),
    },
    revision: 0,
    epoch,
    phase: "prepared",
    stores: {},
    acknowledgments: {},
  });
  db.close();
  await chmod(dbPath, 0o600);
  const launch = () => {
    const child = spawn(
      process.execPath,
      [resolve("scripts/s36/transport/daemon.mjs"), prepared.configPath],
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
          return await evaluate(panel, "S36Transport.ready()");
        } catch {
          return undefined;
        }
      },
      7000,
      "RPC_READY",
    );
    const first = await evaluate(panel, "S36Transport.mirror()");
    assert.equal(first.mirror, true);
    assert.equal(await evaluate(panel, "S36Transport.negatives()"), true);
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
          return await evaluate(panel, "S36Transport.readback()");
        } catch {
          return false;
        }
      },
      7000,
      "RPC_RESTART_READBACK",
    );
    assert.equal(await evaluate(panel, "S36Transport.reopen()"), true);
    assert.equal(await evaluate(panel, "globalThis.s36CspViolations"), 0);
    daemon.child.kill("SIGTERM");
    await daemon.closed;
    const stored = new DatabaseSync(dbPath);
    assert.equal(
      stored.prepare("SELECT COUNT(*) AS n FROM mg02_policy_mirror").get().n,
      1,
    );
    assert.equal(
      stored.prepare("SELECT admission FROM migration_fence").get().admission,
      0,
    );
    assert.doesNotMatch(
      JSON.stringify(
        stored.prepare("SELECT body FROM mg02_policy_mirror").all(),
      ),
      /PRIVATE_PAGE_CANARY/,
    );
    stored.close();
    uninstallRelease(input);
    return {
      result: "PASS",
      actualIndexedDbToSqlite: true,
      cspViolations: 0,
      authenticatedNativeMessaging: true,
      restartReadback: true,
      indexedDbReopen: true,
      wrongProfileAndRawSourceRejected: true,
      admission: false,
      taskReady: false,
      seedAndFreeze: "controlled fixture; no installed source-writer freeze",
      registration: "isolated profile",
    };
  } finally {
    daemon.child.kill("SIGTERM");
    await daemon.closed;
  }
}
