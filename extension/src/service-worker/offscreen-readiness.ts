import { ContractError } from "../security/validation.js";
import type { BrowserChromeApi } from "./browser-api.js";

const providerReadyCheckKind = "OFFSCREEN_PROVIDER_READY_CHECK";
const providerReadyKind = "OFFSCREEN_PROVIDER_READY";
const offscreenReadyAttempts = 20;
const offscreenReadyRetryMs = 50;

export const createOffscreenReadiness = (
  chromeApi: BrowserChromeApi | undefined,
) => {
  let offscreenReady: Promise<void> | undefined;
  const ensureOffscreen = async (): Promise<void> => {
    const offscreen = chromeApi?.offscreen;
    if (!offscreen || !chromeApi)
      throw new ContractError("PROVIDER_UNAVAILABLE");
    let documentExists =
      offscreen.hasDocument && (await offscreen.hasDocument());
    const offscreenUrl = chromeApi.runtime.getURL("offscreen/index.html");
    if (!documentExists && chromeApi.runtime.getContexts) {
      const contexts = await chromeApi.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [offscreenUrl],
      });
      documentExists = contexts.length > 0;
    }
    if (!documentExists) {
      offscreenReady ??= offscreen
        .createDocument({
          url: "offscreen/index.html",
          reasons: ["BLOBS"],
          justification: "Proxy provider requests from a document context.",
        })
        .finally(() => {
          offscreenReady = undefined;
        });
      await offscreenReady;
    }
    for (let attempt = 0; attempt < offscreenReadyAttempts; attempt += 1) {
      try {
        const response = await chromeApi.runtime.sendMessage({
          kind: providerReadyCheckKind,
        });
        if (
          typeof response === "object" &&
          response !== null &&
          (response as { kind?: unknown }).kind === providerReadyKind
        )
          return;
      } catch {
        // The document can exist before its module has registered a listener.
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, offscreenReadyRetryMs);
      });
    }
    throw new ContractError(
      "PROVIDER_UNAVAILABLE",
      "offscreen provider proxy did not become ready",
    );
  };
  return ensureOffscreen;
};
