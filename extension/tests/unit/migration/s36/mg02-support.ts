import { defaultAgentPreferences } from "../../../../src/policy/permission-mode.js";
import { defaultApprovalPolicy } from "../../../../src/policy/approval-policy.js";
import { convertMg02 } from "../../../../../apps/chrome-extension/src/migration/mg02-convert.js";
import type {
  PolicyMirror,
  PolicyMirrorPort,
} from "../../../../../packages/policy-engine/src/migration-contract.js";
import { migrationDigest } from "../../../../../apps/chrome-extension/src/migration/migration-digest.js";
export const permission = (
  action: "allow" | "deny" = "deny",
  capability = "click",
  host = "example.test",
) => ({ capability, host, action, duration: "always" });
export function preferences() {
  return {
    ...defaultAgentPreferences(),
    page_method_enabled: true,
    approval_policy: defaultApprovalPolicy(),
  };
}
export function policySource() {
  return {
    contextpilot_permissions: [permission("allow"), permission("deny", "type")],
    agent_preferences: preferences(),
  };
}
export const draftPolicy = () =>
  convertMg02({ agent_preferences: preferences() });
export function memoryMirror() {
  const values = new Map<string, PolicyMirror>();
  const key = (profile: string, id: string) => JSON.stringify([profile, id]);
  const ack = (value: PolicyMirror) => ({
    schema: "wca.mg02-ack/v1" as const,
    profileGuard: value.profileGuard,
    migrationId: value.migrationId,
    epoch: value.epoch,
    policyRevision: value.policyRevision,
    manifestDigest: migrationDigest(value),
  });
  const port: PolicyMirrorPort = {
    async put(value) {
      const old = values.get(key(value.profileGuard, value.migrationId));
      if (old && migrationDigest(old) !== migrationDigest(value))
        throw new Error("MIRROR_CONFLICT");
      values.set(
        key(value.profileGuard, value.migrationId),
        structuredClone(value),
      );
      return ack(value);
    },
    async read(profile, id, epoch) {
      const value = values.get(key(profile, id));
      if (!value || value.epoch !== epoch) return undefined;
      return ack(value);
    },
  };
  return { port, values };
}
