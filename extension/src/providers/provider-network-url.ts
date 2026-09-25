import { fail } from "../security/validation.js";

const ipv4 = (hostname: string): number[] | undefined => {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part)))
    return undefined;
  const values = parts.map(Number);
  return values.every((value) => value >= 0 && value <= 255)
    ? values
    : undefined;
};
const loopback = (hostname: string): boolean => {
  const address = ipv4(hostname);
  return (
    hostname === "localhost" ||
    hostname === "[::1]" ||
    (address !== undefined && address[0] === 127)
  );
};
const privateIpv4 = (hostname: string): boolean => {
  const address = ipv4(hostname);
  if (!address) return false;
  return (
    address[0] === 10 ||
    (address[0] === 172 && address[1]! >= 16 && address[1]! <= 31) ||
    (address[0] === 192 && address[1] === 168)
  );
};

export const validateProviderBaseUrl = (
  raw: string,
  privateNetworkOptIn = false,
): URL => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail("INVALID_ARGUMENT");
  }
  if (url.username || url.password || url.search || url.hash)
    return fail("INVALID_ARGUMENT");
  if (url.protocol === "https:") {
    if (privateIpv4(url.hostname) && privateNetworkOptIn !== true)
      return fail("INVALID_ARGUMENT");
    return url;
  }
  if (
    url.protocol === "http:" &&
    (loopback(url.hostname) ||
      (privateNetworkOptIn === true && privateIpv4(url.hostname)))
  )
    return url;
  return fail("INVALID_ARGUMENT");
};

export const providerHttpHostPattern = (url: URL): string =>
  url.protocol === "http:"
    ? `http://${url.hostname}/*`
    : fail("INVALID_ARGUMENT");
