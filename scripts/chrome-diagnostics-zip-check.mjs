import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

/** Validate the archive produced by the actual panel, including central offsets. */
export const checkDiagnosticsZip = (values) => {
  const archive = Buffer.from(values);
  const end = archive.length - 22;
  assert.equal(archive.readUInt32LE(end), 0x06054b50);
  const count = archive.readUInt16LE(end + 10);
  assert.equal(count, 10);
  let offset = archive.readUInt32LE(end + 16);
  const centralStart = offset;
  const files = {};
  for (let index = 0; index < count; index++) {
    assert.equal(archive.readUInt32LE(offset), 0x02014b50);
    assert.equal(archive.readUInt16LE(offset + 10), 0);
    const size = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const name = archive
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString();
    const local = archive.readUInt32LE(offset + 42);
    assert.equal(archive.readUInt32LE(local), 0x04034b50);
    assert.equal(archive.readUInt32LE(local + 22), size);
    const start =
      local +
      30 +
      archive.readUInt16LE(local + 26) +
      archive.readUInt16LE(local + 28);
    const data = archive.subarray(start, start + size);
    assert.equal(crc32(data), archive.readUInt32LE(offset + 16));
    assert.equal(crc32(data), archive.readUInt32LE(local + 14));
    assert.equal(
      data.includes(Buffer.from("DIAGNOSTICS_SECRET_")),
      false,
      `secret in ${name}`,
    );
    assert.equal(
      data.includes(Buffer.from("analysis.fixture.test")),
      false,
      `endpoint in ${name}: ${data.toString().slice(Math.max(0, data.toString().indexOf("analysis.fixture.test") - 80), data.toString().indexOf("analysis.fixture.test") + 100)}`,
    );
    assert.equal(Object.hasOwn(files, name), false);
    files[name] = {
      data,
      parsed: name.endsWith(".json")
        ? JSON.parse(data.toString())
        : data.toString(),
    };
    offset +=
      46 +
      nameLength +
      archive.readUInt16LE(offset + 30) +
      archive.readUInt16LE(offset + 32);
  }
  assert.equal(offset, end);
  assert.equal(offset - centralStart, archive.readUInt32LE(end + 12));
  const manifest = files["manifest.json"].parsed;
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.files.length, 9);
  for (const entry of manifest.files) {
    const data = files[entry.name].data;
    assert.equal(data.length, entry.bytes);
    assert.equal(
      createHash("sha256").update(data).digest("base64url"),
      entry.sha256,
    );
  }
  return Object.fromEntries(
    Object.entries(files).map(([name, file]) => [name, file.parsed]),
  );
};
