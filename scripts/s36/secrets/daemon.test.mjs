import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  existsSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { secretPackage } from "./package-fixture.mjs";
import { fixture } from "../transport/support.mjs";
import {
  providerSettings,
  migrationDigest,
  MigrationJournal,
} from "../../../dist/s36/transport.mjs";
test("packaged daemon rejects invalid pin, mode, permissions and concurrent ownership before database creation", () => {
  for (const fault of [
    "pin",
    "mode",
    "extra",
    "tamper",
    "permissions",
    "lock",
    "install-lock",
    "socket",
    "unavailable-os",
  ]) {
    const pkg = secretPackage(),
      directory = mkdtempSync(`${tmpdir()}/s36-daemon-`);
    const config = `${directory}/pairing.json`;
    try {
      writeFileSync(
        config,
        JSON.stringify({
          installationId: randomUUID(),
          profileId: randomUUID(),
          extensionIds: ["a".repeat(32)],
          secret: "b".repeat(64),
          socketPath: `${directory}/agent.sock`,
        }),
        { mode: 0o600 },
      );
      if (fault === "tamper")
        writeFileSync(
          `${pkg.root}/agent-server/secret-service.py`,
          "# changed\n",
        );
      if (fault === "permissions") chmodSync(config, 0o644);
      if (fault === "lock")
        writeFileSync(`${directory}/migration-daemon.lock`, "existing-owner");
      if (fault === "install-lock")
        writeFileSync(`${directory}/install.lock`, "existing-installer");
      if (fault === "socket")
        writeFileSync(`${directory}/agent.sock`, "existing-owner");
      const result = spawnSync(
        process.execPath,
        [
          pkg.daemon,
          fault === "pin" ? "0".repeat(64) : pkg.id,
          config,
          fault === "mode"
            ? "unknown"
            : fault === "unavailable-os"
              ? "--settings-os-store"
              : "--settings-session-only",
          ...(fault === "extra" ? ["extra"] : []),
        ],
        {
          timeout: 6000,
          env: {
            ...process.env,
            DBUS_SESSION_BUS_ADDRESS: "unix:path=/nonexistent/s36-test-bus",
          },
        },
      );
      assert.equal(result.status, 1, fault);
      assert.equal(existsSync(`${directory}/migration.sqlite`), false, fault);
      assert.equal(
        existsSync(`${directory}/migration-daemon.lock`),
        fault === "lock",
        fault,
      );
      assert.equal(
        existsSync(`${directory}/install.lock`),
        fault === "install-lock",
        fault,
      );
      assert.equal(
        existsSync(`${directory}/agent.sock`),
        fault === "socket",
        fault,
      );
      assert.doesNotMatch(
        result.stdout.toString() + result.stderr.toString(),
        /bbbbbbbbbbbbbbbb/,
      );
    } finally {
      pkg.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }
});
test("packaged Session-only daemon transfers credentials without adding activation authority", async () => {
  const pkg = secretPackage();
  let f;
  try {
    f = await fixture(
      true,
      providerSettings(),
      true,
      ["--settings-session-only"],
      [pkg.daemon, pkg.id],
    );
    const client = f.client(),
      status = await client.rpc.status();
    assert.equal(status.settingsMode, "session-only");
    assert.equal(status.admission, false);
    const db = new DatabaseSync(f.dbPath);
    const view = new MigrationJournal(db).read();
    db.close();
    const scope = { migrationId: "wire", epoch: 1, revision: view.revision };
    const source = {
      profileGuard: f.profile,
      async assertFrozen() {},
      async sourceDigest(unit) {
        return view.manifest.sourceDigests[unit];
      },
    };
    assert.equal(
      (await client.rpc.checkResume(scope, source)).sourceMatched,
      true,
    );
    const cp = await client.settings.stage(
      "wire",
      1,
      migrationDigest({ provider_settings: f.data.provider_settings }),
      "session-only",
    );
    await f.stop();
    await f.start();
    assert.equal(
      (await f.client().rpc.checkResume(scope, source)).phase,
      "prepared",
    );
    await assert.rejects(
      f.client().rpc.checkResume(scope, {
        ...source,
        async sourceDigest(unit) {
          return unit === "MG04" ? "0".repeat(64) : source.sourceDigest(unit);
        },
      }),
    );
    await assert.rejects(
      f.client().settings.validate("wire", 1, cp, "session-only"),
    );
    assert.equal((await f.client().rpc.status()).admission, false);
  } finally {
    await f?.close();
    pkg.close();
  }
});
