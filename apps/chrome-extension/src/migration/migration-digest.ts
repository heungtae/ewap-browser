import {
  base64Url,
  digestCanonical,
} from "../../../../extension/src/security/canonical.js";
export function hexDigest(encoded: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded))
    throw new Error("MIGRATION_DIGEST_ENCODING");
  const bytes = Uint8Array.from(
    atob(encoded.replaceAll("-", "+").replaceAll("_", "/") + "="),
    (char) => char.charCodeAt(0),
  );
  if (bytes.length !== 32 || base64Url(bytes) !== encoded)
    throw new Error("MIGRATION_DIGEST_ENCODING");
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
export function browserDigest(hex: string): string {
  if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error("MIGRATION_DIGEST_ENCODING");
  return base64Url(
    Uint8Array.from({ length: 32 }, (_value, index) =>
      parseInt(hex.slice(index * 2, index * 2 + 2), 16),
    ),
  );
}
// S36 uses hex SHA-256; Browser canonical hashes use base64url. Keep the
// encoding boundary explicit without changing existing staged identities.
export function migrationDigest(value: unknown): string {
  return hexDigest(digestCanonical(value));
}
