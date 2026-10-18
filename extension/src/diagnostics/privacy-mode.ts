declare const __CONTEXTPILOT_DIAGNOSTICS_MODE__: "development" | "release";

/** The bundler fixes this value; settings and page messages cannot override it. */
export const developmentDiagnostics = (): boolean =>
  typeof __CONTEXTPILOT_DIAGNOSTICS_MODE__ !== "undefined" &&
  __CONTEXTPILOT_DIAGNOSTICS_MODE__ === "development";

export const diagnosticsPrivacy = () => ({
  diagnostics_mode: developmentDiagnostics() ? "development" : "release",
  diagnostics_masked: !developmentDiagnostics(),
});
