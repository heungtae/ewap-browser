import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isolatedKeyring } from "./fixture.mjs";
import { installedFixture } from "./installed-fixture.mjs";
export async function installedOs() {
  const keyring = await isolatedKeyring(),
    f = installedFixture();
  const pkg = f.packages[0];
  try {
    await f.start(pkg, "--settings-os-store");
    const initial = await f.status();
    assert.equal(initial.settingsMode, "os-store");
    assert.equal(initial.admission, false);
    await f.stop();
    await keyring.lock();
    assert.equal(
      spawnSync(process.execPath, f.command(pkg, "--settings-os-store"), {
        timeout: 6000,
      }).status,
      1,
    );
    for (const name of ["install.lock", "migration-daemon.lock", "agent.sock"])
      assert.equal(existsSync(`${f.input.directory}/${name}`), false);
    await keyring.unlock();
    await f.start(pkg, "--settings-os-store");
    assert.deepEqual(await f.status(), initial);
  } finally {
    await f.close();
    await keyring.close();
  }
}
