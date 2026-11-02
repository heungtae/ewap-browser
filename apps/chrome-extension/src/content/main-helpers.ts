// Packaged serializable primitives. Callers must establish current document,
// policy and approval bindings before injection; these exports grant no authority.
export { installPageMethodRegistryMain } from "../../../../extension/src/service-worker/page-method-registry-main.js";
export { discoverPageMethodsMain } from "../../../../extension/src/service-worker/page-method-discovery-main.js";
export { invokePageMethodMain } from "../../../../extension/src/service-worker/page-method-invoke-main.js";
export {
  probeFixturePageApi,
  invokeFixturePageApi,
} from "../../../../extension/src/service-worker/page-api-main.js";
export { readFixturePageApi } from "../../../../extension/src/page-api/read-adapter.js";
