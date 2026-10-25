import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  installRelease,
  uninstallRelease,
} from "../../../dist/s36/installation.mjs";
import { installationFixture } from "./support.mjs";
const host = "ai.contextpilot.agent.json";
test("private install, repair, interrupted preparation and uninstall preserve pairing and unrelated data", () => {
  const f = installationFixture(),
    i = f.input;
  try {
    const result = installRelease(i);
    const config = readFileSync(result.configPath, "utf8");
    for (const [path, mode] of [
      [i.directory, 0o700],
      [i.registry, 0o700],
      [result.configPath, 0o600],
      [`${i.directory}/host.sh`, 0o700],
      [`${i.registry}/${host}`, 0o600],
    ])
      assert.equal(statSync(path).mode & 0o777, mode);

    assert.doesNotMatch(
      JSON.stringify(result),
      new RegExp(JSON.parse(config).secret),
    );
    const reg = JSON.parse(readFileSync(`${i.registry}/${host}`, "utf8"));
    assert.deepEqual(reg.allowed_origins, [
      `chrome-extension://${i.extensionId}/`,
    ]);
    assert.equal(reg.path, `${i.directory}/host.sh`);
    rmSync(`${i.directory}/host.sh`);
    const receipt = JSON.parse(
      readFileSync(`${i.directory}/installation.json`, "utf8"),
    );
    writeFileSync(
      `${i.directory}/installation.json`,
      JSON.stringify({ ...receipt, state: "installing" }),
    );
    installRelease(i);
    assert.equal(readFileSync(result.configPath, "utf8"), config);
    writeFileSync(`${i.directory}/user-data.txt`, "preserve");
    assert.equal(uninstallRelease(i).registered, false);
    assert.equal(existsSync(reg.path), false);
    assert.equal(existsSync(`${i.registry}/${host}`), false);
    assert.equal(readFileSync(result.configPath, "utf8"), config);
    assert.equal(
      readFileSync(`${i.directory}/user-data.txt`, "utf8"),
      "preserve",
    );
    uninstallRelease(i);
    installRelease(i);
    assert.equal(readFileSync(result.configPath, "utf8"), config);
  } finally {
    f.close();
  }
});
test("invalid release and identity changes fail before replacing an owned installation", () => {
  const f = installationFixture(),
    i = f.input;
  try {
    installRelease(i);
    const original = readFileSync(`${i.registry}/${host}`, "utf8");
    assert.throws(
      () => installRelease({ ...i, extensionId: "b".repeat(32) }),
      /INSTALL_IDENTITY_CONFLICT/,
    );
    f.release.write("agent-server/launcher.cjs", "damaged release");
    assert.throws(() => installRelease(i), /RELEASE_CHANGED/);
    assert.equal(readFileSync(`${i.registry}/${host}`, "utf8"), original);
    assert.equal(uninstallRelease(i).state, "uninstalled");
  } finally {
    f.close();
  }
});
test("foreign files, altered pairing and unsafe permissions are preserved and rejected", () => {
  for (const fault of [
    "foreign",
    "pairing",
    "permissions",
    "symlink",
    "ancestor",
  ]) {
    const f = installationFixture(),
      i = f.input;
    try {
      if (fault === "ancestor") {
        symlinkSync(f.root, `${f.root}/alias`);
        assert.throws(
          () => installRelease({ ...i, directory: `${f.root}/alias/agent` }),
          /INSTALL_PATH/,
        );
        continue;
      }
      installRelease(i);
      if (fault === "foreign")
        writeFileSync(`${i.registry}/${host}`, "foreign");
      if (fault === "pairing")
        writeFileSync(`${i.directory}/pairing.json`, "changed");
      if (fault === "permissions") chmodSync(i.registry, 0o755);
      if (fault === "symlink") {
        rmSync(`${i.directory}/host.sh`);
        symlinkSync("/bin/sh", `${i.directory}/host.sh`);
      }
      assert.throws(() => installRelease(i), /INSTALL_/);
      assert.throws(() => uninstallRelease(i), /INSTALL_/);
      assert.equal(existsSync(`${i.registry}/${host}`), true);
    } finally {
      f.close();
    }
  }
});
test("active socket or competing lock prevents install and removal", () => {
  for (const name of ["agent.sock", "install.lock"]) {
    const f = installationFixture(),
      i = f.input;
    try {
      installRelease(i);
      writeFileSync(`${i.directory}/${name}`, "blocked", { mode: 0o600 });
      assert.throws(() => installRelease(i), /INSTALL_(BACKEND_ACTIVE|LOCKED)/);
      assert.throws(
        () => uninstallRelease(i),
        /INSTALL_(BACKEND_ACTIVE|LOCKED)/,
      );
      assert.equal(existsSync(`${i.registry}/${host}`), true);
    } finally {
      f.close();
    }
  }
});
test("unowned registration is not adopted even when the pairing directory is empty", () => {
  const f = installationFixture(),
    i = f.input;
  try {
    mkdirSync(i.registry, { mode: 0o700 });
    writeFileSync(`${i.registry}/${host}`, "foreign", { mode: 0o600 });
    assert.throws(() => installRelease(i), /INSTALL_FOREIGN_FILE/);
    assert.equal(readFileSync(`${i.registry}/${host}`, "utf8"), "foreign");
    assert.equal(existsSync(`${i.directory}/pairing.json`), false);
  } finally {
    f.close();
  }
});

test("removal remains possible after the entire artifact directory disappears", () => {
  const f = installationFixture();
  try {
    installRelease(f.input);
    rmSync(f.release.root, { recursive: true });
    assert.equal(uninstallRelease(f.input).state, "uninstalled");
  } finally {
    f.close();
  }
});
