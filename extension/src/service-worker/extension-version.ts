import { chromeApi } from "./runtime-platform.js";

export const extensionVersion =
  chromeApi?.runtime?.getManifest?.()?.version ?? "unknown";
