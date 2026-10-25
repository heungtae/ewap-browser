import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { installedFixture } from "./installed-fixture.mjs";
import {
  installDaemonLauncher,
  removeDaemonLauncher,
  transitionRelease,
  uninstallRelease,
} from "../../../dist/s36/installation.mjs";
import { waitFor } from "../../chrome-cdp-utils.mjs";
test("opt-in foreground launcher pins mode/release and explicitly updates after native release selection", async () => {
  const f = installedFixture(),
    target = {
      ...f.input,
      releaseDirectory: f.packages[1].root,
      releaseId: f.packages[1].id,
    };
  let child, closed;
  const run = async (path) => {
    child = spawn(path, [], { stdio: "ignore" });
    closed = new Promise((resolve) => child.once("close", resolve));
    await waitFor(
      () => existsSync(`${f.input.directory}/agent.sock`),
      3000,
      "LAUNCHER_SOCKET",
    );
  };
  const stop = async () => {
    child.kill("SIGTERM");
    assert.equal(await closed, 0);
  };
  try {
    const config = readFileSync(`${f.input.directory}/pairing.json`, "utf8");
    assert.equal(existsSync(`${f.input.directory}/migration.sh`), false);
    const kit = installDaemonLauncher(f.input, "session-only");
    assert.equal(kit.started, false);
    assert.equal(existsSync(`${f.input.directory}/agent.sock`), false);
    assert.equal(statSync(kit.launcher).mode & 0o777, 0o700);
    assert.equal(
      spawnSync(kit.launcher, ["--settings-os-store"], { timeout: 4000 })
        .status,
      64,
    );
    await run(kit.launcher);
    const initial = await f.status();
    assert.equal(initial.settingsMode, "session-only");
    assert.throws(
      () => installDaemonLauncher(f.input, "session-only"),
      /INSTALL_LOCKED/,
    );
    assert.throws(() => removeDaemonLauncher(f.input), /INSTALL_LOCKED/);
    await stop();
    rmSync(kit.launcher);
    installDaemonLauncher(f.input, "session-only");
    transitionRelease(f.input, target);
    assert.equal(spawnSync(kit.launcher, [], { timeout: 4000 }).status, 1);
    installDaemonLauncher(target, "session-only");
    await run(kit.launcher);
    assert.deepEqual(await f.status(), initial);
    await stop();
    assert.throws(
      () => installDaemonLauncher(target, "os-store"),
      /DAEMON_MODE_CHANGE_REQUIRES_REMOVAL/,
    );
    uninstallRelease(target);
    assert.equal(spawnSync(kit.launcher, [], { timeout: 4000 }).status, 1);
    assert.equal(removeDaemonLauncher(target).credentialsDeleted, false);
    assert.equal(existsSync(kit.launcher), false);
    assert.equal(
      existsSync(`${f.input.directory}/migration-launcher.json`),
      false,
    );
    assert.equal(
      readFileSync(`${f.input.directory}/pairing.json`, "utf8"),
      config,
    );
  } finally {
    child?.kill("SIGTERM");
    if (closed) await closed;
    await f.close();
  }
});
test("foreign files and interrupted companion states fail closed and retain ownership evidence", async () => {
  for (const fault of ["foreign", "receipt", "installing", "removing"]) {
    const f = installedFixture(),
      path = `${f.input.directory}/migration.sh`,
      receiptPath = `${f.input.directory}/migration-launcher.json`;
    try {
      installDaemonLauncher(f.input, "session-only");
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      if (fault === "foreign") writeFileSync(path, "foreign");
      else if (fault === "receipt") writeFileSync(receiptPath, "{}");
      else {
        receipt.state = fault;
        writeFileSync(receiptPath, JSON.stringify(receipt));
        rmSync(path);
      }
      if (fault === "installing") {
        installDaemonLauncher(f.input, "session-only");
        assert.equal(existsSync(path), true);
      } else if (fault === "removing") {
        assert.throws(
          () => installDaemonLauncher(f.input, "session-only"),
          /DAEMON_REMOVAL_PENDING/,
        );
        removeDaemonLauncher(f.input);
        assert.equal(existsSync(receiptPath), false);
      } else {
        const body = existsSync(path) ? readFileSync(path, "utf8") : undefined;
        assert.throws(
          () => installDaemonLauncher(f.input, "session-only"),
          /DAEMON_FOREIGN_FILE|DAEMON_RECEIPT_INVALID/,
        );
        assert.throws(
          () => removeDaemonLauncher(f.input),
          /DAEMON_FOREIGN_FILE|DAEMON_RECEIPT_INVALID/,
        );
        assert.equal(readFileSync(path, "utf8"), body);
      }
    } finally {
      await f.close();
    }
  }
});

test("unsupported package configures no launcher and mode changes require explicit removal", async () => {
  const { installationFixture } = await import("../install/support.mjs");
  const { installRelease } = await import("../../../dist/s36/installation.mjs");
  const plain = installationFixture(),
    f = installedFixture();
  try {
    installRelease(plain.input);
    assert.throws(
      () => installDaemonLauncher(plain.input, "session-only"),
      /DAEMON_PACKAGE_REQUIRED/,
    );
    assert.equal(
      existsSync(`${plain.input.directory}/migration-launcher.json`),
      false,
    );
    assert.throws(
      () => installDaemonLauncher(f.input, "unknown"),
      /DAEMON_MODE/,
    );
    assert.equal(existsSync(`${f.input.directory}/migration.sh`), false);
    installDaemonLauncher(f.input, "session-only");
    removeDaemonLauncher(f.input);
    const result = installDaemonLauncher(f.input, "os-store");
    assert.equal(result.mode, "os-store");
    assert.equal(result.started, false);
    const config = JSON.parse(
      readFileSync(`${f.input.directory}/pairing.json`, "utf8"),
    );
    assert.equal(
      readFileSync(result.launcher, "utf8").includes(config.secret),
      false,
    );
    assert.equal(
      readFileSync(
        `${f.input.directory}/migration-launcher.json`,
        "utf8",
      ).includes(config.secret),
      false,
    );
    assert.equal(existsSync(`${f.input.directory}/agent.sock`), false);
  } finally {
    plain.close();
    await f.close();
  }
});
