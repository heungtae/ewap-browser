import { ContractError } from "../security/validation.js";
import { withDeadline } from "../security/deadline.js";
import { installPageMethodRegistryMain } from "./page-method-registry-main.js";
import { discoverPageMethodsMain } from "./page-method-main.js";
import type { Dependencies, Injection } from "./page-method-runner-contract.js";

export const discoverPageMethods = async (
  deps: Dependencies,
  tabId: number,
  documentId: string,
  registryKey: string,
): Promise<Injection[]> => {
  if (!deps.scripting) throw new ContractError("PAGE_API_UNAVAILABLE");
  await withDeadline(
    deps.scripting.executeScript({
      target: { tabId, documentIds: [documentId] },
      world: "MAIN",
      func: installPageMethodRegistryMain as never,
      args: [registryKey],
    }),
    5_000,
    "PAGE_API_TIMEOUT",
  );
  return withDeadline(
    deps.scripting.executeScript({
      target: { tabId, documentIds: [documentId] },
      world: "MAIN",
      func: discoverPageMethodsMain as never,
      args: [registryKey],
    }),
    5_000,
    "PAGE_API_TIMEOUT",
  );
};
