import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { install } from "./install.mjs";
const extensionId = "a".repeat(32);
test("Linux installer dry run, repair, ACL, identity and secret privacy", async () => {
  const directory = await mkdtemp(`${tmpdir()}/s28-install-`);
  try {
    const dry = await install({
      directory,
      extensionId,
      executable: process.execPath,
    });
    assert.equal(dry.registered, false);
    assert.equal(dry.state, "dry-run");
    const prepared = await install({
      directory,
      extensionId,
      executable: process.execPath,
      dryRun: false,
    });
    const first = await readFile(prepared.configPath, "utf8");
    assert.equal((await stat(prepared.configPath)).mode & 0o777, 0o600);
    assert.ok(!JSON.stringify(prepared).includes(JSON.parse(first).secret));
    await install({
      directory,
      extensionId,
      executable: process.execPath,
      dryRun: false,
    });
    assert.equal(await readFile(prepared.configPath, "utf8"), first);
    await assert.rejects(
      install({
        directory,
        extensionId: "b".repeat(32),
        executable: process.execPath,
        dryRun: false,
      }),
      /PAIRING_IDENTITY_CONFLICT/,
    );
    await assert.rejects(
      install({ directory, extensionId, executable: "/bin/sh" }),
      /WRONG_EXECUTABLE/,
    );
    await rm(`${directory}/host.sh`);
    await symlink("/bin/sh", `${directory}/host.sh`);
    await assert.rejects(
      install({
        directory,
        extensionId,
        executable: process.execPath,
        dryRun: false,
      }),
      /INSTALL_PERMISSIONS/,
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
