import {
  approvalModeLabel,
  validateApprovalPolicy,
} from "../policy/approval-policy.js";
import { isPlainObject } from "../security/validation.js";

export type PreferenceChanges = {
  addListener(
    listener: (
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ) => void,
  ): void;
};

export const observeApprovalMode = (
  load: (() => Promise<unknown>) | undefined,
  changes: PreferenceChanges | undefined,
  apply: (mode: string) => void,
): void => {
  let changed = false;
  const update = (preferences: unknown): void => {
    if (!isPlainObject(preferences)) return;
    try {
      if (preferences.approval_policy !== undefined)
        apply(
          approvalModeLabel(
            validateApprovalPolicy(preferences.approval_policy),
          ),
        );
      else if (typeof preferences.permission_mode === "string")
        apply(preferences.permission_mode);
    } catch {
      // Invalid stored preferences must not be presented as an approval mode.
    }
  };
  changes?.addListener((values, area) => {
    if (area !== "local" || !("agent_preferences" in values)) return;
    changed = true;
    update(values.agent_preferences?.newValue);
  });
  void load?.()
    .then((response) => {
      if (!changed && isPlainObject(response)) update(response.preferences);
    })
    .catch(() => undefined);
};
