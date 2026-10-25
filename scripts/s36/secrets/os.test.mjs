import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readdir,
  readFile,
  copyFile,
  chmod,
  writeFile,
} from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  captureReleaseSet,
  releaseSetId,
  verifyReleaseSet,
} from "../../../dist/s36/release-set.mjs";
import {
  installRelease,
  uninstallRelease,
} from "../../../dist/s36/installation.mjs";
import { installationFixture } from "../install/support.mjs";
import { LinuxSecretServiceStore } from "../../../dist/s36/linux-secret-store.mjs";
import { fixture, validated } from "../integration/fixture.mjs";
import { isolatedKeyring } from "./fixture.mjs";
test("real isolated OS store survives helper and keyring restart; identities/profiles remain separate", async () => {
  const k = await isolatedKeyring();
  try {
    const value = "S36-PRIVATE-TEST-CANARY-OS-ONLY";
    await k.store.write("provider-one", value);
    assert.equal(await (await k.connect()).read("provider-one"), value);
    assert.equal(await k.store.read("provider-two"), undefined);
    assert.equal(
      await (await k.connect("c".repeat(64))).read("provider-one"),
      undefined,
    );
    await k.stop();
    await assert.rejects(k.store.read("provider-one"), /OS_SECRET_UNAVAILABLE/);
    await k.start(false);
    await assert.rejects(k.connect(), /OS_SECRET_UNAVAILABLE/);
    await k.unlock();
    const resumed = await k.connect();
    assert.equal(await resumed.read("provider-one"), value);
    for (const name of await readdir(`${k.root}/data/keyrings`)) {
      const contents = await readFile(`${k.root}/data/keyrings/${name}`);
      assert.equal(contents.includes(Buffer.from(value)), false);
    }
  } finally {
    await k.close();
  }
});
test("locked or unavailable OS store fails closed without session/plaintext fallback", async () => {
  const k = await isolatedKeyring();
  try {
    await k.store.write("identity", "PRIVATE-LOCKED-CANARY");
    await k.lock();
    await assert.rejects(
      k.store.read("identity"),
      (error) =>
        error.message === "OS_SECRET_UNAVAILABLE" &&
        !error.stack.includes("PRIVATE-LOCKED-CANARY"),
    );
    await assert.rejects(
      k.store.write("identity", "changed"),
      /OS_SECRET_UNAVAILABLE/,
    );
    await assert.rejects(k.connect(), /OS_SECRET_UNAVAILABLE/);
    await k.unlock();
    assert.equal(
      await (await k.connect()).read("identity"),
      "PRIVATE-LOCKED-CANARY",
    );
  } finally {
    await k.close();
  }
});
test("MG01 actual SQLite staging keeps OS-secret readback after restart, and lock blocks agreement", async () => {
  const k = await isolatedKeyring(),
    f = await fixture();
  try {
    const wired = await validated(f, f.wire(undefined, undefined, k.store));
    await k.stop();
    f.restartBackend();
    await f.restartBrowser();
    await k.start(false);
    await k.unlock();
    const resumed = f.wire(undefined, undefined, await k.connect());
    await resumed.run.prepare(f.input);
    await resumed.run.copy();
    await k.lock();
    await assert.rejects(resumed.run.acknowledge());
    assert.equal(f.journal.state().namespace, "legacy");
    assert.equal(f.journal.state().admission, 0);
    await k.unlock();
    await resumed.run.acknowledge();
    await resumed.run.commit();
    const row = JSON.stringify(
      f.db.prepare("SELECT body FROM mg01_settings_stage").all(),
    );
    assert.doesNotMatch(row, /PRIVATE_API_CANARY|PRIVATE_HEADER_CANARY/);
    assert.match(row, /os-store/);
    assert.equal(f.journal.read().phase, "committed");
    assert.equal(f.journal.state().admission, 0);
    assert.equal(wired.settings.profileGuard, f.profile);
  } finally {
    await f.close();
    await k.close();
  }
});
test("input/helper boundaries reject unsafe configuration and oversized or NUL values", async () => {
  const k = await isolatedKeyring();
  try {
    await assert.rejects(
      LinuxSecretServiceStore.connect(k.helper, "other-profile"),
      /OS_SECRET_CONFIGURATION/,
    );
    await assert.rejects(
      k.store.write("identity", "a".repeat(65537)),
      /OS_SECRET_VALUE/,
    );
    await assert.rejects(
      k.store.write("identity", "nul\0value"),
      /OS_SECRET_VALUE/,
    );
    await assert.rejects(k.store.read(""), /OS_SECRET_IDENTITY/);
  } finally {
    await k.close();
  }
});

test("authenticated MG01 RPC reuses persisted OS credentials after daemon restart", async () => {
  const { qualifyOsTransfer } = await import(
    "../settings-transfer/os-case.mjs"
  );
  await qualifyOsTransfer();
});
test("pinned packaged daemon selects OS store and preserves authenticated restart readback", async () => {
  const { qualifyOsTransfer } = await import(
    "../settings-transfer/os-case.mjs"
  );
  await qualifyOsTransfer(true);
});

test("installed pinned Linux secret package reads OS values and uninstall retains them", async () => {
  const k = await isolatedKeyring(),
    f = installationFixture();
  try {
    const directory = `${f.release.root}/agent-server`;
    for (const name of ["linux-secret-store.mjs", "secret-service.py"]) {
      await copyFile(`dist/s36/${name}`, `${directory}/${name}`);
      await chmod(`${directory}/${name}`, 0o600);
    }
    const manifest = captureReleaseSet(
      f.release.root,
      f.release.manifest.source,
    );
    await writeFile(
      `${f.release.root}/release-set.json`,
      JSON.stringify(manifest),
    );
    f.input.releaseId = releaseSetId(manifest);
    verifyReleaseSet(f.release.root, f.input.releaseId);
    installRelease(f.input);
    const { LinuxSecretServiceStore: PackagedStore } = await import(
      pathToFileURL(`${directory}/linux-secret-store.mjs`).href
    );
    const store = await PackagedStore.connect(
      `${directory}/secret-service.py`,
      "d".repeat(64),
    );
    await store.write("packaged-identity", "PRIVATE-PACKAGE-CANARY");
    assert.equal(
      await store.read("packaged-identity"),
      "PRIVATE-PACKAGE-CANARY",
    );
    uninstallRelease(f.input);
    assert.equal(
      await store.read("packaged-identity"),
      "PRIVATE-PACKAGE-CANARY",
    );
    assert.equal(manifest.credentials, "session-only");
  } finally {
    f.close();
    await k.close();
  }
});

test("installed OS-mode daemon authenticates via registered host and refuses a locked store", async () => {
  const { installedOs } = await import("./installed-os.mjs");
  await installedOs();
});

test("generated OS-mode foreground launcher fails locked startup and removal retains credentials", async () => {
  const { launcherOs } = await import("./launcher-os.mjs");
  await launcherOs();
});
