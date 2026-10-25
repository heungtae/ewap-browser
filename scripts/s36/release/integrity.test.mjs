import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, symlinkSync, truncateSync } from "node:fs";
import { join } from "node:path";
import {
  verifyReleaseSet,
  releaseIntegrityPredicate,
  releaseSetId,
} from "../../../dist/s36/release-set.mjs";
import { releaseFixture } from "./support.mjs";
test("complete pinned tree verifies and only accepts the independently pinned release ID", async () => {
  const f = releaseFixture();
  try {
    assert.equal(verifyReleaseSet(f.root, f.id).scope, "qualification-only");
    const compatible = releaseIntegrityPredicate(f.root, f.id);
    assert.equal(await compatible(f.id), true);
    assert.equal(await compatible("other"), false);
    assert.throws(() => verifyReleaseSet(f.root, "0".repeat(64)), /RELEASE_ID/);
  } finally {
    f.close();
  }
});
test("missing, changed and additional artifacts invalidate a previously accepted predicate", async () => {
  for (const fault of ["missing", "changed", "extra", "dependency", "root"]) {
    const f = releaseFixture();
    try {
      const compatible = releaseIntegrityPredicate(f.root, f.id);
      assert.equal(await compatible(f.id), true);
      if (fault === "missing")
        rmSync(join(f.root, "agent-server/launcher.cjs"));
      else if (fault === "changed")
        f.write("chrome-extension/js/service-worker.js", "changed");
      else if (fault === "extra") f.write("agent-server/unlisted.cjs", "extra");
      else if (fault === "dependency")
        f.write("dependencies/pnpm-lock.yaml", "different dependency version");
      else f.write("unlisted-root.sh", "extra");
      assert.equal(await compatible(f.id), false);
    } finally {
      f.close();
    }
  }
});
test("symlinked files and components are rejected rather than hashed through external paths", () => {
  for (const relative of [
    "agent-server/launcher.cjs",
    "agent-server",
    "release-set.json",
  ]) {
    const f = releaseFixture();
    try {
      rmSync(join(f.root, relative), { recursive: true });
      symlinkSync(
        join(f.root, "dependencies/package.json"),
        join(f.root, relative),
      );
      assert.throws(() => verifyReleaseSet(f.root, f.id));
    } finally {
      f.close();
    }
  }
});
test("rewritten manifest and version/protocol/runtime skew fail closed", async () => {
  for (const patch of [
    { protocol: { major: 2, minor: 0 } },
    { versions: { extension: "9.0.0", backend: "0.0.0", browserApp: "0.0.0" } },
    { architecture: process.arch === "x64" ? "arm64" : "x64" },
    { credentials: "os-store" },
  ]) {
    const f = releaseFixture();
    try {
      const altered = { ...f.manifest, ...patch };
      f.write("release-set.json", altered);
      assert.equal(await releaseIntegrityPredicate(f.root, f.id)(f.id), false);
      if (patch.credentials) assert.throws(() => releaseSetId(altered));
      else assert.throws(() => verifyReleaseSet(f.root, releaseSetId(altered)));
    } finally {
      f.close();
    }
  }
});

test("oversized sparse artifacts are rejected before reading their contents", async () => {
  const f = releaseFixture();
  try {
    truncateSync(
      join(f.root, "agent-server/launcher.cjs"),
      64 * 1024 * 1024 + 1,
    );
    assert.equal(await releaseIntegrityPredicate(f.root, f.id)(f.id), false);
  } finally {
    f.close();
  }
});
