export type Readiness =
  | "MISSING_HOST"
  | "INVALID_EXECUTABLE"
  | "INCOMPATIBLE_VERSION"
  | "UNPAIRED"
  | "SESSION_ONLY"
  | "BRIDGE_READY";
export function capabilityHealth(input: {
  hostInstalled: boolean;
  executableValid: boolean;
  protocolMajor: number;
  paired: boolean;
  durableSecrets: boolean;
}): { state: Readiness; taskReady: false; browserDispatchReady: false } {
  const state = !input.hostInstalled
    ? "MISSING_HOST"
    : !input.executableValid
      ? "INVALID_EXECUTABLE"
      : input.protocolMajor !== 1
        ? "INCOMPATIBLE_VERSION"
        : !input.paired
          ? "UNPAIRED"
          : !input.durableSecrets
            ? "SESSION_ONLY"
            : "BRIDGE_READY";
  return { state, taskReady: false, browserDispatchReady: false };
}
