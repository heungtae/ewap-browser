import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { secretPackage } from "./package-fixture.mjs";
import {
  captureReleaseSet,
  releaseSetId,
} from "../../../dist/s36/release-set.mjs";
import {
  installRelease,
  uninstallRelease,
} from "../../../dist/s36/installation.mjs";
import { waitFor } from "../../chrome-cdp-utils.mjs";
for (const [signal, probeFails] of [
  ["SIGTERM", false],
  ["SIGINT", false],
  ["SIGTERM", true],
]) {
  test(`${signal} during ${probeFails ? "failing" : "successful"} OS probe retains ownership until completion and suppresses startup`, async () => {
    const pkg = secretPackage(),
      directory = mkdtempSync(`${tmpdir()}/s36-startup-stop-`);
    const input = {
      directory: `${directory}/agent`,
      registry: `${directory}/registry`,
      releaseDirectory: pkg.root,
      releaseId: pkg.id,
      extensionId: "a".repeat(32),
    };
    const marker = `${directory}/probe-started`,
      gate = `${directory}/probe-finish`;
    let child, closed;
    try {
      writeFileSync(
        `${pkg.root}/agent-server/secret-service.py`,
        `import pathlib, time\npathlib.Path(${JSON.stringify(marker)}).touch()\ndeadline = time.monotonic() + 3\nwhile not pathlib.Path(${JSON.stringify(gate)}).exists() and time.monotonic() < deadline: time.sleep(0.01)\nprint('{"ok":${probeFails ? "false" : "true"}}')\n`,
      );
      const manifest = captureReleaseSet(pkg.root, pkg.manifest.source);
      pkg.write("release-set.json", manifest);
      input.releaseId = releaseSetId(manifest);
      installRelease(input);
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
      let exited = false;
      closed = new Promise((resolve) =>
        child.once("close", (code) => {
          exited = true;
          resolve(code);
        }),
      );
      await waitFor(() => existsSync(marker), 3000, "PROBE_STARTED");
      child.kill(signal);
      child.kill(signal);
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(
        exited,
        false,
        "ownership must be retained while the helper is outstanding",
      );
      assert.throws(() => installRelease(input), /INSTALL_LOCKED/);
      writeFileSync(gate, "finish");
      assert.equal(await closed, probeFails ? 1 : 0);
      for (const name of [
        "agent.sock",
        "install.lock",
        "migration-daemon.lock",
        "migration.sqlite",
      ])
        assert.equal(existsSync(`${input.directory}/${name}`), false, name);
      assert.equal(installRelease(input).registered, true);
      assert.equal(uninstallRelease(input).registered, false);
    } finally {
      child?.kill("SIGKILL");
      if (closed) await closed;
      pkg.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
