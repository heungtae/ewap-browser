import { ContractError } from "../security/validation.js";
export type RequestContext = {
  requestId?: string;
  generation?: number;
  documentEpoch?: string;
  progress?(stage: "PROVIDER_BODY"): void;
  tabId: number;
  signal: AbortSignal;
  check(): void;
};
export const assertRequestActive = (context?: RequestContext): void => {
  if (context?.signal.aborted) throw new ContractError("POLICY_DENIED");
  context?.check();
};
