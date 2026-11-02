import type { Pairing } from "./native-types.js";
export const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
export async function nativeHello(p: Pairing, nonce: string, codebase = false) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(p.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = new TextEncoder().encode(
    JSON.stringify([
      1,
      0,
      p.installationId,
      p.profileId,
      p.extensionId,
      nonce,
      ...(codebase ? [["codebase.read"]] : []),
    ]),
  );
  const proof = hex(await crypto.subtle.sign("HMAC", key, data));
  return {
    kind: "hello",
    major: 1,
    minor: 0,
    installationId: p.installationId,
    profileId: p.profileId,
    extensionId: p.extensionId,
    nonce,
    proof,
    ...(codebase ? { capabilities: ["codebase.read"] } : {}),
  };
}
export const wireDigest = async (value: unknown) =>
  hex(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(value)),
    ),
  );
