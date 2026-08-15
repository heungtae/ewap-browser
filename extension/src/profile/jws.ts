import { fail, isPlainObject } from "../security/validation.js";
import type { Profile } from "./profile.js";

type Header = { alg: "ES256"; typ: "company-page-profile+jws"; kid: string };
const fromBase64Url = (part: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) return fail("PROFILE_UNAVAILABLE");
  try {
    const base64 = `${part.replaceAll("-", "+").replaceAll("_", "/")}${"=".repeat((4 - (part.length % 4)) % 4)}`;
    return Uint8Array.from(atob(base64), (character) =>
      character.charCodeAt(0),
    );
  } catch {
    return fail("PROFILE_UNAVAILABLE");
  }
};
const decodeJson = <T>(part: string): T => {
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64Url(part))) as T;
  } catch {
    return fail("PROFILE_UNAVAILABLE");
  }
};
const spkiFromPem = (pem: string): Uint8Array => {
  const body = pem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");
  return fromBase64Url(
    body.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""),
  );
};
export const verifyProfileJws = async (
  compact: string,
  keyRing: Readonly<Record<string, string>>,
): Promise<Profile> => {
  if (new TextEncoder().encode(compact).byteLength > 64 * 1024)
    return fail("PROFILE_UNAVAILABLE");
  const [protectedPart, payloadPart, signaturePart, ...rest] =
    compact.split(".");
  if (!protectedPart || !payloadPart || !signaturePart || rest.length)
    return fail("PROFILE_UNAVAILABLE");
  const rawHeader = decodeJson<unknown>(protectedPart);
  if (!isPlainObject(rawHeader)) return fail("PROFILE_UNAVAILABLE");
  const header = rawHeader as Header;
  const allowedHeaders = ["alg", "typ", "kid"];
  if (
    header.alg !== "ES256" ||
    header.typ !== "company-page-profile+jws" ||
    typeof header.kid !== "string" ||
    Object.keys(header).some((key) => !allowedHeaders.includes(key))
  )
    return fail("PROFILE_UNAVAILABLE");
  const pem = keyRing[header.kid];
  if (!pem) return fail("PROFILE_UNAVAILABLE");
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "spki",
      spkiFromPem(pem),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
  } catch {
    return fail("PROFILE_UNAVAILABLE");
  }
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    fromBase64Url(signaturePart),
    new TextEncoder().encode(`${protectedPart}.${payloadPart}`),
  );
  return valid ? decodeJson<Profile>(payloadPart) : fail("PROFILE_UNAVAILABLE");
};
