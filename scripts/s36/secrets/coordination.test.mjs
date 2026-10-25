import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { secretPackage } from "./package-fixture.mjs";
import {
  captureReleaseSet,
  releaseSetId,
} from "../../../dist/s36/release-set.mjs";
import {
  installRelease,
  uninstallRelease,
  transitionRelease,
} from "../../../dist/s36/installation.mjs";
import { waitFor } from "../../chrome-cdp-utils.mjs";
test("daemon blocks install/uninstall/transition throughout a paused pre-socket OS probe", async () => {
  const pkg = secretPackage(),
    target = secretPackage();
  const directory = mkdtempSync(`${tmpdir()}/s36-coordination-`);
  const input = {
    directory: `${directory}/agent`,
    registry: `${directory}/registry`,
    releaseDirectory: pkg.root,
    releaseId: pkg.id,
    extensionId: "a".repeat(32),
  };
  let child, closed;
  try {
    // A controlled helper pauses only its probe; no real keyring or secret value is involved.
    const marker = `${directory}/probe-started`;
    writeFileSync(
      `${pkg.root}/agent-server/secret-service.py`,
      `import pathlib, time\npathlib.Path(${JSON.stringify(marker)}).touch()\ntime.sleep(4)\nprint('{"ok":true}')\n`,
    );
    const manifest = captureReleaseSet(pkg.root, pkg.manifest.source);
    pkg.write("release-set.json", manifest);
    input.releaseId = releaseSetId(manifest);
    installRelease(input);
    const original = readFileSync(
      `${input.directory}/installation.json`,
      "utf8",
    );
    child = spawn(
      process.execPath,
      [
        pkg.daemon,
        input.releaseId,
        `${input.directory}/pairing.json`,
        "--settings-os-store",
      ],
      { stdio: "ignore" },
    );
    closed = new Promise((resolve) => child.once("close", resolve));
    await waitFor(() => existsSync(marker), 3000, "PAUSED_PROBE");
    assert.equal(existsSync(`${input.directory}/agent.sock`), false);
    assert.throws(() => installRelease(input), /INSTALL_LOCKED/);
    assert.throws(() => uninstallRelease(input), /INSTALL_LOCKED/);
    assert.throws(
      () =>
        transitionRelease(input, {
          ...input,
          releaseDirectory: target.root,
          releaseId: target.id,
        }),
      /INSTALL_LOCKED/,
    );
    assert.equal(
      readFileSync(`${input.directory}/installation.json`, "utf8"),
      original,
    );
  } finally {
    child?.kill("SIGTERM");
    if (closed) await closed;
    pkg.close();
    target.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live daemon holds the installation lock and graceful stop permits repair/unregister", async () => {
  const pkg = secretPackage(),
    directory = mkdtempSync(`${tmpdir()}/s36-coordination-`);
  const input = {
    directory: `${directory}/agent`,
    registry: `${directory}/registry`,
    releaseDirectory: pkg.root,
    releaseId: pkg.id,
    extensionId: "a".repeat(32),
  };
  let child, closed;
  try {
    installRelease(input);
    const config = readFileSync(`${input.directory}/pairing.json`, "utf8");
    child = spawn(
      process.execPath,
      [
        pkg.daemon,
        pkg.id,
        `${input.directory}/pairing.json`,
        "--settings-session-only",
      ],
      { stdio: "ignore" },
    );
    closed = new Promise((resolve) => child.once("close", resolve));
    await waitFor(
      () => existsSync(`${input.directory}/agent.sock`),
      3000,
      "LIVE_SOCKET",
    );
    assert.equal(existsSync(`${input.directory}/install.lock`), true);
    assert.throws(() => installRelease(input), /INSTALL_LOCKED/);
    assert.throws(() => uninstallRelease(input), /INSTALL_LOCKED/);
    child.kill("SIGTERM");
    assert.equal(await closed, 0);
    for (const name of ["agent.sock", "install.lock", "migration-daemon.lock"])
      assert.equal(existsSync(`${input.directory}/${name}`), false, name);
    assert.equal(installRelease(input).registered, true);
    assert.equal(uninstallRelease(input).registered, false);
    assert.equal(
      readFileSync(`${input.directory}/pairing.json`, "utf8"),
      config,
    );
  } finally {
    child?.kill("SIGTERM");
    if (closed) await closed;
    pkg.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("installer respects a historical migration lock even without a socket", () => {
  const pkg = secretPackage(),
    directory = mkdtempSync(`${tmpdir()}/s36-coordination-`);
  const input = {
    directory: `${directory}/agent`,
    registry: `${directory}/registry`,
    releaseDirectory: pkg.root,
    releaseId: pkg.id,
    extensionId: "a".repeat(32),
  };
  try {
    installRelease(input);
    const lock = `${input.directory}/migration-daemon.lock`;
    writeFileSync(lock, "historical-owner", { mode: 0o600 });
    assert.throws(() => installRelease(input), /INSTALL_BACKEND_ACTIVE/);
    assert.throws(() => uninstallRelease(input), /INSTALL_BACKEND_ACTIVE/);
    assert.equal(readFileSync(lock, "utf8"), "historical-owner");
    assert.equal(existsSync(`${input.directory}/install.lock`), false);
  } finally {
    pkg.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
