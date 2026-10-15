import { digestCanonical } from "../security/canonical.js";
import {
  decodeProviderState,
  type ProviderSettingsState,
} from "../settings/provider-state.js";
import type { ModelBindings } from "./model-bindings.js";
const same = (a: unknown, b: unknown): boolean => {
  try {
    return digestCanonical(a) === digestCanonical(b);
  } catch {
    return false;
  }
};
/** Cancel affected runs before the new settings become externally visible. */
export const invalidateProviderWrite = async (
  bindings: ModelBindings,
  previous: unknown,
  next: ProviderSettingsState,
): Promise<void> => {
  const prior = decodeProviderState(previous);
  if (prior.active_provider !== next.active_provider)
    await bindings.invalidate();
  else {
    for (const id of new Set([
      ...Object.keys(prior.providers),
      ...Object.keys(next.providers),
    ])) {
      if (!same(prior.providers[id] ?? null, next.providers[id] ?? null))
        await bindings.invalidate(id);
    }
  }
  if (!same(prior.routing, next.routing)) await bindings.invalidateDual();
};
