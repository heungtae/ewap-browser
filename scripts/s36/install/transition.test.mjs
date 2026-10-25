import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  installRelease,
  uninstallRelease,
  transitionRelease,
  transitionPlan,
} from "../../../dist/s36/installation.mjs";
import { switchFixture } from "./transition-support.mjs";
const config = (f) => readFileSync(`${f.from.directory}/pairing.json`, "utf8");
const receipt = (f) =>
  JSON.parse(readFileSync(`${f.from.directory}/installation.json`, "utf8"));
test("explicit forward and reverse transition preserve pairing and registry ownership", () => {
  const f = switchFixture();
  try {
    installRelease(f.from);
    const original = config(f);
    assert.throws(() => installRelease(f.to), /INSTALL_IDENTITY_CONFLICT/);
    transitionRelease(f.from, f.to);
    assert.equal(receipt(f).releaseId, f.to.releaseId);
    transitionRelease(f.from, f.to);
    assert.equal(config(f), original);
    transitionRelease(f.to, f.from);
    assert.equal(receipt(f).releaseId, f.from.releaseId);
    assert.equal(config(f), original);
    uninstallRelease(f.from);
  } finally {
    f.close();
  }
});
test("each controlled interruption resumes the exact externally pinned transition", () => {
  for (const stage of [
    "journal",
    "launcher",
    "registration",
    "receipt",
    "missing",
  ]) {
    const f = switchFixture();
    try {
      installRelease(f.from);
      const original = config(f);
      const plan = transitionPlan(f.from, f.to, receipt(f).configDigest);
      writeFileSync(
        `${f.from.directory}/transition.json`,
        JSON.stringify(plan.journal),
        { mode: 0o600 },
      );
      if (stage !== "journal")
        writeFileSync(`${f.from.directory}/host.sh`, plan.launcher);
      if (["registration", "receipt"].includes(stage))
        writeFileSync(
          `${f.from.registry}/ai.contextpilot.agent.json`,
          plan.registration,
        );
      if (stage === "receipt")
        writeFileSync(
          `${f.from.directory}/installation.json`,
          JSON.stringify(plan.journal.to),
        );
      if (stage === "missing") rmSync(`${f.from.directory}/host.sh`);
      assert.throws(
        () => installRelease(stage === "receipt" ? f.to : f.from),
        /INSTALL_TRANSITION_PENDING/,
      );
      assert.throws(
        () => uninstallRelease(stage === "receipt" ? f.to : f.from),
        /INSTALL_TRANSITION_PENDING/,
      );
      transitionRelease(f.from, f.to);
      assert.equal(receipt(f).releaseId, f.to.releaseId);
      assert.equal(config(f), original);
      assert.equal(existsSync(`${f.from.directory}/transition.json`), false);
      transitionRelease(f.to, f.from);
      assert.equal(receipt(f).releaseId, f.from.releaseId);
    } finally {
      f.close();
    }
  }
});
test("active backend, invalid target, foreign files and changed pairing block transition", () => {
  for (const fault of [
    "active",
    "artifact",
    "foreign",
    "pairing",
    "identity",
    "missing",
  ]) {
    const f = switchFixture();
    try {
      installRelease(f.from);
      const original = readFileSync(`${f.from.directory}/host.sh`, "utf8");
      if (fault === "active")
        writeFileSync(`${f.from.directory}/agent.sock`, "active");
      if (fault === "artifact")
        f.target.write("agent-server/launcher.cjs", "changed");
      if (fault === "foreign")
        writeFileSync(
          `${f.from.registry}/ai.contextpilot.agent.json`,
          "foreign",
        );
      if (fault === "pairing")
        writeFileSync(`${f.from.directory}/pairing.json`, "changed");
      if (fault === "missing")
        rmSync(`${f.from.registry}/ai.contextpilot.agent.json`);
      assert.throws(() =>
        transitionRelease(
          f.from,
          fault === "identity"
            ? { ...f.to, extensionId: "b".repeat(32) }
            : f.to,
        ),
      );
      assert.equal(
        readFileSync(`${f.from.directory}/host.sh`, "utf8"),
        original,
      );
      assert.equal(existsSync(`${f.from.directory}/transition.json`), false);
    } finally {
      f.close();
    }
  }
});
test("pending journal tampering cannot select another release or overwrite foreign state", () => {
  for (const fault of ["journal", "foreign", "pairing"]) {
    const f = switchFixture();
    try {
      installRelease(f.from);
      const plan = transitionPlan(f.from, f.to, receipt(f).configDigest);
      const journal = structuredClone(plan.journal);
      if (fault === "journal") journal.to.releaseId = "0".repeat(64);
      writeFileSync(
        `${f.from.directory}/transition.json`,
        JSON.stringify(journal),
        { mode: 0o600 },
      );
      if (fault === "foreign")
        writeFileSync(`${f.from.directory}/host.sh`, "foreign");
      if (fault === "pairing")
        writeFileSync(`${f.from.directory}/pairing.json`, "changed");
      assert.throws(() => transitionRelease(f.from, f.to), /INSTALL_/);
      assert.equal(existsSync(`${f.from.directory}/transition.json`), true);
      assert.equal(receipt(f).releaseId, f.from.releaseId);
    } finally {
      f.close();
    }
  }
});
