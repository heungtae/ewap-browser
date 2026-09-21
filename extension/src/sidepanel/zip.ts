type ZipFile = { name: string; text: string };

const encoder = new TextEncoder();
const write16 = (view: DataView, offset: number, value: number): void =>
  view.setUint16(offset, value, true);
const write32 = (view: DataView, offset: number, value: number): void =>
  view.setUint32(offset, value >>> 0, true);

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

/** Creates a small, uncompressed ZIP without third-party code in the panel. */
export const diagnosticZip = (files: readonly ZipFile[]): Uint8Array => {
  const entries = files.map(({ name, text }) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    return { nameBytes, data, crc: crc32(data) };
  });
  if (entries.length === 0 || entries.length > 32)
    throw new Error("PAYLOAD_LIMIT_EXCEEDED");
  const localBytes = entries.reduce(
    (total, entry) => total + 30 + entry.nameBytes.length + entry.data.length,
    0,
  );
  const centralBytes = entries.reduce(
    (total, entry) => total + 46 + entry.nameBytes.length,
    0,
  );
  const output = new Uint8Array(localBytes + centralBytes + 22);
  const view = new DataView(output.buffer);
  let offset = 0;
  const offsets: number[] = [];
  for (const entry of entries) {
    offsets.push(offset);
    write32(view, offset, 0x04034b50);
    write16(view, offset + 4, 20);
    write16(view, offset + 6, 0);
    write16(view, offset + 8, 0);
    write16(view, offset + 10, 0);
    write16(view, offset + 12, 0);
    write32(view, offset + 14, entry.crc);
    write32(view, offset + 18, entry.data.length);
    write32(view, offset + 22, entry.data.length);
    write16(view, offset + 26, entry.nameBytes.length);
    write16(view, offset + 28, 0);
    output.set(entry.nameBytes, offset + 30);
    output.set(entry.data, offset + 30 + entry.nameBytes.length);
    offset += 30 + entry.nameBytes.length + entry.data.length;
  }
  const centralOffset = offset;
  for (const [index, entry] of entries.entries()) {
    write32(view, offset, 0x02014b50);
    write16(view, offset + 4, 20);
    write16(view, offset + 6, 20);
    write16(view, offset + 8, 0);
    write16(view, offset + 10, 0);
    write16(view, offset + 12, 0);
    write16(view, offset + 14, 0);
    write32(view, offset + 16, entry.crc);
    write32(view, offset + 20, entry.data.length);
    write32(view, offset + 24, entry.data.length);
    write16(view, offset + 28, entry.nameBytes.length);
    write16(view, offset + 30, 0);
    write16(view, offset + 32, 0);
    write16(view, offset + 34, 0);
    write16(view, offset + 36, 0);
    write32(view, offset + 38, 0);
    write32(view, offset + 42, offsets[index]!);
    output.set(entry.nameBytes, offset + 46);
    offset += 46 + entry.nameBytes.length;
  }
  write32(view, offset, 0x06054b50);
  write16(view, offset + 4, 0);
  write16(view, offset + 6, 0);
  write16(view, offset + 8, entries.length);
  write16(view, offset + 10, entries.length);
  write32(view, offset + 12, centralBytes);
  write32(view, offset + 16, centralOffset);
  write16(view, offset + 20, 0);
  return output;
};
