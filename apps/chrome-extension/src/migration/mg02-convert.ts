import { z } from "zod";
import { permissionHost } from "../../../../extension/src/policy/permission-manager.js";
import {
  legacyCapabilities,
  migrationHost,
  permissionKeys,
  type MigratedPolicy,
} from "../../../../packages/policy-engine/src/migration-contract.js";
import {
  safeMigrationPreferences,
  convertPreferences,
} from "./mg02-preferences.js";
export type PolicySourceSnapshot = {
  contextpilot_permissions?: unknown;
  wb_permissions?: unknown;
  agent_preferences?: unknown;
};
const entrySchema = z.strictObject({
  capability: z.enum(legacyCapabilities),
  host: migrationHost,
  action: z.enum(["allow", "deny"]),
  duration: z.literal("always"),
});
export function convertMg02(snapshot: PolicySourceSnapshot): MigratedPolicy {
  const result: MigratedPolicy = {
    schema: "wca.mg02-policy/v1",
    blocked: false,
    preferences: safeMigrationPreferences(),
    records: [],
    quarantine: [],
    sourceCount: 0,
  };
  const active =
    snapshot.contextpilot_permissions === undefined
      ? "wb_permissions"
      : "contextpilot_permissions";
  for (const sourceKey of permissionKeys) {
    if (snapshot[sourceKey] === undefined) continue;
    const values = snapshot[sourceKey];
    const activeSource = sourceKey === active;
    if (!Array.isArray(values) || values.length > 1024) {
      result.sourceCount++;
      result.quarantine.push({
        sourceKey,
        sourceIndex: -1,
        reason: "INVALID_CONTAINER",
        blocks: activeSource,
      });
      result.blocked ||= activeSource;
      continue;
    }
    for (const [sourceIndex, value] of values.entries()) {
      result.sourceCount++;
      const parsed = entrySchema.safeParse(value);
      let valid = parsed.success;
      if (parsed.success) {
        try {
          valid =
            permissionHost(`https://${parsed.data.host}/`) ===
              parsed.data.host &&
            !(
              parsed.data.capability === "page_method" &&
              parsed.data.action === "allow"
            );
        } catch {
          valid = false;
        }
      }
      if (!parsed.success || !valid) {
        result.quarantine.push({
          sourceKey,
          sourceIndex,
          reason: "INVALID_PERMISSION",
          blocks: activeSource,
        });
        result.blocked ||= activeSource;
        continue;
      }
      const row = parsed.data;
      result.records.push({
        kind: "permission",
        sourceKey,
        sourceIndex,
        capability: row.capability,
        host: row.host,
        originalAction: row.action,
        decision: row.action === "deny" ? "deny" : "ask",
        activeSource,
        reusableGrant: false,
      });
    }
  }
  if (snapshot.agent_preferences !== undefined) {
    result.sourceCount++;
    try {
      const converted = convertPreferences(snapshot.agent_preferences);
      result.preferences = converted.preferences;
      result.records.push({
        kind: "preferences",
        sourceKey: "agent_preferences",
        sourceIndex: 0,
        sourceRevision: converted.sourceRevision,
      });
    } catch {
      result.blocked = true;
      result.quarantine.push({
        sourceKey: "agent_preferences",
        sourceIndex: 0,
        reason: "INVALID_PREFERENCES",
        blocks: true,
      });
    }
  }
  return result;
}
