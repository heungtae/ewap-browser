import { providerHttpHostPattern } from "../providers/provider-network-url.js";
import { ContractError } from "../security/validation.js";
import type { BrowserChromeApi } from "./browser-api.js";

export const requireProviderHostPermission = async (
  chromeApi: BrowserChromeApi | undefined,
  url: URL,
): Promise<void> => {
  if (url.protocol !== "http:") return;
  const pattern = providerHttpHostPattern(url);
  const granted = await chromeApi?.permissions?.contains({
    origins: [pattern],
  });
  if (!granted)
    throw new ContractError(
      "PROVIDER_UNAVAILABLE",
      "local provider host permission is required",
    );
};
