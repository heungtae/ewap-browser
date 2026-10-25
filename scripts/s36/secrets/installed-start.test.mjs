import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { installedFixture } from "./installed-fixture.mjs";
import {
  transitionRelease,
  uninstallRelease,
} from "../../../dist/s36/installation.mjs";
test("installed startup binds actual registered native transport across forward/reverse release switches", async () => {
  const f = installedFixture(),
    [from, to] = f.packages;
  const target = { ...f.input, releaseDirectory: to.root, releaseId: to.id };
  try {
    const pairing = readFileSync(`${f.input.directory}/pairing.json`, "utf8");
    await f.start(from);
    const original = await f.status();
    assert.equal(original.settingsMode, "session-only");
    assert.equal(original.admission, false);
    await f.stop();
    transitionRelease(f.input, target);
    assert.equal(
      spawnSync(process.execPath, f.command(from), { timeout: 4000 }).status,
      1,
    );
    await f.start(to);
    assert.deepEqual(await f.status(), original);
    await f.stop();
    transitionRelease(target, f.input);
    await f.start(from);
    assert.deepEqual(await f.status(), original);
    await f.stop();
    assert.equal(
      readFileSync(`${f.input.directory}/pairing.json`, "utf8"),
      pairing,
    );
    uninstallRelease(f.input);
    assert.equal(
      spawnSync(process.execPath, f.command(from), { timeout: 4000 }).status,
      1,
    );
  } finally {
    await f.close();
  }
});
test("installed startup rejects incomplete, stale or altered installation before database/socket creation", async () => {
  for (const fault of [
    "missing",
    "installing",
    "removing",
    "uninstalled",
    "transition",
    "pairing",
    "host-missing",
    "host-changed",
    "registration-missing",
    "registration-changed",
    "executable",
    "registry-mode",
    "forged-plan",
    "other-config",
  ]) {
    const f = installedFixture(),
      i = f.input;
    try {
      const receiptPath = `${i.directory}/installation.json`,
        receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      let args = f.command();
      if (fault === "missing") rmSync(receiptPath);
      else if (["installing", "removing", "uninstalled"].includes(fault)) {
        receipt.state = fault;
        writeFileSync(receiptPath, JSON.stringify(receipt));
      } else if (fault === "transition")
        writeFileSync(`${i.directory}/transition.json`, "{}", { mode: 0o600 });
      else if (fault === "pairing")
        writeFileSync(`${i.directory}/pairing.json`, "{}");
      else if (fault === "host-missing") rmSync(`${i.directory}/host.sh`);
      else if (fault === "host-changed")
        writeFileSync(`${i.directory}/host.sh`, "changed");
      else if (fault === "registration-missing")
        rmSync(`${i.registry}/ai.contextpilot.agent.json`);
      else if (fault === "registration-changed")
        writeFileSync(`${i.registry}/ai.contextpilot.agent.json`, "{}");
      else if (fault === "executable") {
        receipt.executable = "/other/node";
        writeFileSync(receiptPath, JSON.stringify(receipt));
      } else if (fault === "registry-mode") chmodSync(i.registry, 0o755);
      else if (fault === "forged-plan") {
        receipt.launcherDigest = "a".repeat(64);
        writeFileSync(receiptPath, JSON.stringify(receipt));
      } else {
        copyFileSync(
          `${i.directory}/pairing.json`,
          `${i.directory}/other.json`,
        );
        args = [...args];
        args[2] = `${i.directory}/other.json`;
      }
      const result = spawnSync(process.execPath, args, { timeout: 4000 });
      assert.equal(result.status, 1, fault);
      for (const name of [
        "agent.sock",
        "install.lock",
        "migration-daemon.lock",
        "migration.sqlite",
      ])
        assert.equal(
          existsSync(`${i.directory}/${name}`),
          false,
          `${fault}/${name}`,
        );
      assert.equal(existsSync(receiptPath), fault !== "missing");
    } finally {
      await f.close();
    }
  }
});
