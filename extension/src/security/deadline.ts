import type { ErrorCode } from "../contracts/core-types.js";
import { ContractError } from "./validation.js";
export const withDeadline = async <T>(
  promise: Promise<T>,
  ms: number,
  code: ErrorCode,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ContractError(code)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};
