import { registerServiceWorker } from "./runtime-registration.js";
import { dataAdapterRegistry } from "../page-api/data-adapters/index.js";
import { fixtureDataAdapter } from "../page-api/data-adapters/fixture.js";

export const startServiceWorker = (): void => {
  dataAdapterRegistry.register(fixtureDataAdapter);
  registerServiceWorker();
};
