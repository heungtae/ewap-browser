import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  root,
  read,
  manifestPath,
  validateInventory,
} from "./s26-inventory.mjs";
const manifest = read(manifestPath);
validateInventory(manifest);
for (const suffix of [".ts", ".config.json"]) {
  const path = `extension/tests/fixture/s26-unowned-${randomUUID()}${suffix}`;
  const absolute = resolve(root, path);
  writeFileSync(absolute, suffix === ".ts" ? "export {};\n" : "{}\n", {
    flag: "wx",
  });
  try {
    assert.throws(() => validateInventory(manifest), /Unmapped file:/);
  } finally {
    unlinkSync(absolute);
  }
}
console.log(
  "S26-R01 PASS: physical unowned source/config rejected; fixture files removed",
);
