import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isolatedKeyring } from "./fixture.mjs";
import { installedFixture } from "./installed-fixture.mjs";
import {
  installDaemonLauncher,
  removeDaemonLauncher,
} from "../../../dist/s36/installation.mjs";
import { LinuxSecretServiceStore } from "../../../dist/s36/linux-secret-store.mjs";
import { waitFor } from "../../chrome-cdp-utils.mjs";
export async function launcherOs() {
  const keyring = await isolatedKeyring(),
    f = installedFixture();
  let child, closed;
  try {
    const kit = installDaemonLauncher(f.input, "os-store");
    const start = async () => {
      child = spawn(kit.launcher, [], { stdio: "ignore" });
      closed = new Promise((resolve) => child.once("close", resolve));
      await waitFor(
        () => existsSync(`${f.input.directory}/agent.sock`),
        4000,
        "OS_LAUNCHER_SOCKET",
      );
    };
    await start();
    const status = await f.status();
    assert.equal(status.settingsMode, "os-store");
    assert.equal(status.admission, false);
    const store = await LinuxSecretServiceStore.connect(
      `${f.packages[0].root}/agent-server/secret-service.py`,
      status.profileGuard,
    );
    await store.write("launcher-retention", "PRIVATE-LAUNCHER-RETENTION");
    child.kill("SIGTERM");
    assert.equal(await closed, 0);
    await keyring.lock();
    assert.equal(spawnSync(kit.launcher, [], { timeout: 6000 }).status, 1);
    await keyring.unlock();
    await start();
    assert.deepEqual(await f.status(), status);
    child.kill("SIGTERM");
    assert.equal(await closed, 0);
    removeDaemonLauncher(f.input);
    assert.equal(
      await store.read("launcher-retention"),
      "PRIVATE-LAUNCHER-RETENTION",
    );
  } finally {
    child?.kill("SIGTERM");
    if (closed) await closed;
    await f.close();
    await keyring.close();
  }
}
