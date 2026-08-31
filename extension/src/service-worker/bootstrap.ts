import { registerServiceWorker } from "./runtime-registration.js";

export const startServiceWorker = (): void => {
  registerServiceWorker();
};
