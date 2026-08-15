import type { ErrorCode } from "../contracts/types.js";

export class ContractError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(code);
  }
}
export const fail = (code: ErrorCode): never => {
  throw new ContractError(code);
};
export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export const closedObject = (
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> => {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    return fail("INVALID_ARGUMENT");
  return value;
};
export const string = (value: unknown, max: number): string =>
  typeof value === "string" && [...value].length <= max && !value.includes("\0")
    ? value
    : fail("INVALID_ARGUMENT");
export const opaque = (value: unknown): string => {
  const result = string(value, 64);
  return /^[A-Za-z0-9_-]{16,64}$/.test(result)
    ? result
    : fail("INVALID_ARGUMENT");
};
export const requireKeys = (
  record: Record<string, unknown>,
  keys: readonly string[],
): void => {
  if (keys.some((key) => !(key in record))) fail("INVALID_ARGUMENT");
};
