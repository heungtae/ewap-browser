import { ContractError } from "../security/validation.js";
import { withDeadline } from "../security/deadline.js";
import { discoverPageMethodsMain } from "./page-method-main.js";
import type { Dependencies, Injection } from "./page-method-runner-contract.js";

export const discoverPageMethods = async (
  deps: Dependencies,
  tabId: number,
  documentId: string,
): Promise<Injection[]> => {
  if (!deps.scripting) throw new ContractError("PAGE_API_UNAVAILABLE");
  return withDeadline(
    deps.scripting.executeScript({
      target: { tabId, documentIds: [documentId] },
      world: "MAIN",
      func: discoverPageMethodsMain as never,
      args: [],
    }),
    5_000,
    "PAGE_API_TIMEOUT",
  );
};
