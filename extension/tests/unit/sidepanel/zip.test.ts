import { expect, it } from "vitest";
import { diagnosticZip } from "../../../src/sidepanel/zip.js";

it("writes readable local and central ZIP directory entries", () => {
  const zip = diagnosticZip([
    { name: "manifest.json", text: '{"schema_version":1}' },
    { name: "README.txt", text: "safe diagnostics" },
  ]);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  expect(view.getUint32(0, true)).toBe(0x04034b50);
  const end = zip.byteLength - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  expect(view.getUint16(end + 8, true)).toBe(2);
  expect(new TextDecoder().decode(zip)).toContain("manifest.json");
  expect(new TextDecoder().decode(zip)).toContain("README.txt");
});
