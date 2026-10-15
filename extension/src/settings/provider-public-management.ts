import { usableJev, type ProviderSettingsState } from "./provider-state.js";
export const providerManagementState = (state: ProviderSettingsState) => {
  const decision = state.routing.decision_provider
    ? usableJev(state.providers[state.routing.decision_provider])
    : undefined;
  const primaryConfigured = !!(
    state.active_provider &&
    state.providers[state.active_provider]?.config.enabled
  );
  return {
    revision: state.revision,
    active_provider: state.active_provider,
    routing: state.routing,
    primary_configured: primaryConfigured,
    effective_mode:
      state.routing.mode === "jev" && decision && primaryConfigured
        ? "jev"
        : "single",
  };
};
