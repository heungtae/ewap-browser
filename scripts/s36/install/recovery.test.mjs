import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import {
  installRelease,
  uninstallRelease,
} from "../../../dist/s36/installation.mjs";
import {
  releaseSetId,
  verifyReleaseSet,
} from "../../../dist/s36/release-set.mjs";
import { releaseFixture } from "../release/support.mjs";
import { installationFixture } from "./support.mjs";
test("interrupted removal resumes and cannot be mistaken for installation repair", () => {
  const f = installationFixture(),
    i = f.input;
  try {
    installRelease(i);
    const path = `${i.directory}/installation.json`;
    const receipt = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify({ ...receipt, state: "removing" }));
    rmSync(`${i.registry}/ai.contextpilot.agent.json`);
    assert.throws(() => installRelease(i), /INSTALL_REMOVAL_PENDING/);
    assert.equal(uninstallRelease(i).state, "uninstalled");
    assert.equal(existsSync(`${i.directory}/host.sh`), false);
  } finally {
    f.close();
  }
});
test("a different valid release requires a separate upgrade operation and cannot replace current files", () => {
  const f = installationFixture(),
    target = releaseFixture();
  try {
    installRelease(f.input);
    const original = readFileSync(`${f.input.directory}/host.sh`, "utf8");
    target.manifest.source.revision = "b".repeat(40);
    target.write("release-set.json", target.manifest);
    assert.throws(
      () =>
        installRelease({
          ...f.input,
          releaseDirectory: target.root,
          releaseId: releaseSetId(target.manifest),
        }),
      /INSTALL_IDENTITY_CONFLICT/,
    );
    assert.equal(
      readFileSync(`${f.input.directory}/host.sh`, "utf8"),
      original,
    );
  } finally {
    target.close();
    f.close();
  }
});
test("malformed existing pairing errors never expose its raw content", () => {
  const f = installationFixture();
  try {
    mkdirSync(f.input.directory, { mode: 0o700 });
    writeFileSync(
      `${f.input.directory}/pairing.json`,
      'PRIVATE_PAIRING_CANARY{"secret":',
      { mode: 0o600 },
    );
    assert.throws(
      () => installRelease(f.input),
      (error) =>
        error.message === "INSTALL_PAIRING_INVALID" &&
        !error.stack.includes("PRIVATE_PAIRING_CANARY"),
    );
  } finally {
    f.close();
  }
});

test("installation and registry roots cannot overlap the immutable artifact tree", () => {
  const f = installationFixture();
  try {
    for (const patch of [
      { directory: f.release.root },
      { registry: `${f.release.root}/registry` },
    ])
      assert.throws(
        () => installRelease({ ...f.input, ...patch }),
        /INSTALL_PATH/,
      );
    assert.equal(
      verifyReleaseSet(f.release.root, f.release.id).scope,
      "qualification-only",
    );
  } finally {
    f.close();
  }
});
