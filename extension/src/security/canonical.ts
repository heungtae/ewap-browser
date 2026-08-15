export const base64Url = (input: Uint8Array): string =>
  btoa(String.fromCharCode(...input))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
export const opaqueId = (bytes = 24): string => {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
};
export const uuid = (): string => crypto.randomUUID();
const canonicalize = (value: unknown): string => {
  if (value === null || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0))
      throw new Error("INVALID_ARGUMENT");
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("INVALID_ARGUMENT");
};
export const canonicalJson = (value: unknown): string => canonicalize(value);
const rightRotate = (value: number, amount: number): number =>
  (value >>> amount) | (value << (32 - amount));
const constants = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
export const sha256 = (value: string): string => {
  const source = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(source);
  bytes[source.length] = 0x80;
  new DataView(bytes.buffer).setUint32(
    paddedLength - 4,
    source.length * 8,
    false,
  );
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const view = new DataView(bytes.buffer, offset, 64);
    for (let index = 0; index < 16; index += 1)
      words[index] = view.getUint32(index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15]!;
      const b = words[index - 2]!;
      words[index] =
        (rightRotate(a, 7) ^ rightRotate(a, 18) ^ (a >>> 3)) +
        words[index - 16]! +
        (rightRotate(b, 17) ^ rightRotate(b, 19) ^ (b >>> 10)) +
        words[index - 7]!;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rightRotate(e!, 6) ^ rightRotate(e!, 11) ^ rightRotate(e!, 25);
      const choice = (e! & f!) ^ (~e! & g!);
      const t1 = h! + s1 + choice + constants[index]! + words[index]!;
      const s0 = rightRotate(a!, 2) ^ rightRotate(a!, 13) ^ rightRotate(a!, 22);
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      [h, g, f, e, d, c, b, a] = [
        g!,
        f!,
        e!,
        (d! + t1) >>> 0,
        c!,
        b!,
        a!,
        (t1 + s0 + majority) >>> 0,
      ];
    }
    hash[0] = (hash[0]! + a!) >>> 0;
    hash[1] = (hash[1]! + b!) >>> 0;
    hash[2] = (hash[2]! + c!) >>> 0;
    hash[3] = (hash[3]! + d!) >>> 0;
    hash[4] = (hash[4]! + e!) >>> 0;
    hash[5] = (hash[5]! + f!) >>> 0;
    hash[6] = (hash[6]! + g!) >>> 0;
    hash[7] = (hash[7]! + h!) >>> 0;
  }
  const result = new Uint8Array(32);
  const out = new DataView(result.buffer);
  hash.forEach((part, index) => out.setUint32(index * 4, part!, false));
  return base64Url(result);
};
export const digestCanonical = (value: unknown): string =>
  sha256(canonicalJson(value));
