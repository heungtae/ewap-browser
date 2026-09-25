import { providerHttpHostPattern } from "../providers/provider-network-url.js";
import { ContractError } from "../security/validation.js";
import type { BrowserChromeApi } from "./browser-api.js";

export const requireProviderHostPermission = async (
  chromeApi: BrowserChromeApi | undefined,
  url: URL,
): Promise<void> => {
  if (url.protocol !== "http:") return;
  const pattern = providerHttpHostPattern(url);
  // A screenshot opt-in can grant <all_urls>; it does not grant an HTTP
  // Provider endpoint. Require the endpoint's own optional host grant.
  const grants = await chromeApi?.permissions?.getAll();
  const granted = grants?.origins?.includes(pattern) === true;
  if (!granted)
    throw new ContractError(
      "PROVIDER_UNAVAILABLE",
      "local provider host permission is required",
    );
};
