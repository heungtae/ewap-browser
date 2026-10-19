import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { root, digest } from "./s26-inventory.mjs";
import { read, validateInventory, manifestPath } from "./s26-inventory.mjs";
import { requireQualification } from "./s26-qualification.mjs";
const baseline = read(manifestPath);
const paths = baseline.files.map((entry) => entry.path);
test("S26-R01: added source, config and alias cannot silently acquire ownership", () => {
  for (const path of [
    "extension/src/new-source.ts",
    "new.config.json",
    "extension/src/legacy-alias.ts",
  ])
    assert.throws(
      () => validateInventory(baseline, [...paths, path]),
      /Unmapped/,
    );
});
test("S26-R01: missing owner, wrong Sprint and duplicate path fail closed", () => {
  for (const patch of [
    { owner: "UNKNOWN" },
    { sprint: "S99" },
    { target: "" },
  ]) {
    const manifest = structuredClone(baseline);
    Object.assign(manifest.files[0], patch);
    assert.throws(() => validateInventory(manifest, paths));
  }
  assert.throws(
    () =>
      validateInventory(
        { ...baseline, files: [...baseline.files, baseline.files[0]] },
        paths,
      ),
    /Duplicate/,
  );
});
test("S26-R06: fixture PASS cannot qualify JEV, MCP, install or release", () => {
  const fixture = { result: "PASS", scope: "fixture" };
  assert.equal(requireQualification(fixture, "fixture"), true);
  for (const scope of ["live-jev", "real-mcp", "os-install", "release"])
    assert.throws(() => requireQualification(fixture, scope), /Insufficient/);
});
test("S26-R06: immutable holdout IDs and mode denominators", () => {
  const { cases, metrics } = read("docs/baselines/s26/qualification.json");
  assert.equal(new Set(cases.map((entry) => entry.id)).size, cases.length);
  assert.equal(cases.filter((entry) => entry.mode === "ask").length, 100);
  assert.equal(cases.filter((entry) => entry.mode === "act").length, 100);
  assert.equal(metrics.length, 7);
});

test("S26-R06: frozen corpus content must not change during tuning", () => {
  assert.equal(
    digest(
      readFileSync(resolve(root, "docs/baselines/s26/qualification.json")),
    ),
    "e6999e3a36b4b29c476713b74e3b398830708173b663ee298c3b6b85252b91d0",
  );
});
test("S26-R04/R05: storage and consumers retain explicit decisions and source callers", () => {
  const storage = read("docs/baselines/s26/storage.json");
  for (const entry of storage.records) {
    assert.ok(entry.key || entry.key_pattern);
    assert.ok(
      ["convert", "archive", "adapter", "retire"].includes(entry.decision),
    );
    assert.ok(entry.sources.length > 0);
    for (const source of entry.sources)
      assert.ok(existsSync(resolve(root, source)), source);
  }
  for (const entry of read("docs/baselines/s26/consumers.json").consumers) {
    assert.ok(existsSync(resolve(root, entry.implementation)));
    assert.ok(entry.static_callers.length || entry.zero_caller_rule);
    assert.ok(entry.compatibility.includes("UNVERIFIED"));
    for (const caller of entry.static_callers)
      assert.ok(existsSync(resolve(root, caller.caller)));
  }
});
