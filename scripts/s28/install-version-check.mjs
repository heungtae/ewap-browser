import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { install } from "./install.mjs";
assert.ok(
  Number(process.versions.node.split(".")[0]) < 20,
  "Run with an unsupported Node version (the qualification uses Node 18)",
);
const path = `${tmpdir()}/s28-version-denied-${process.pid}`;
await assert.rejects(
  install({
    directory: path,
    extensionId: "a".repeat(32),
    executable: process.execPath,
  }),
  /NODE_VERSION/,
);
await assert.rejects(access(path), { code: "ENOENT" });
console.log(
  "PASS: unsupported Node rejected before configuration/registration writes",
);
