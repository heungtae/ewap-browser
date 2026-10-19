import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// Built public package consumers must not resolve private TS source at runtime.
test("isolated public package exports load in Node without extension globals", async () => {
  for (const [name, key] of [
    ["shared", "bridge"],
    ["task-engine", "decisions"],
    ["provider-adapters", "jev"],
  ]) {
    const manifest = JSON.parse(
      await readFile(`dist/s28/packages/${name}/package.json`, "utf8"),
    );
    const entry = manifest.exports[`./${key}`].node;
    const loaded = await import(
      new URL(`../../dist/s28/packages/${name}/${entry}`, import.meta.url)
    );
    assert.ok(Object.keys(loaded).length > 0);
    if (name === "shared") assert.equal(loaded.MAX_FRAME_BYTES, 262144);
  }
});
