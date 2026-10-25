import { parseSettingsSource } from "../../shared/src/migration-settings.js";
import { migrationCommandSchema } from "../../shared/src/migration-rpc.js";
import { mg02MirrorSchema } from "./migration-contract.js";
// The generic bridge envelope is domain-validated at both privileged endpoints.
export function parseMigrationCommand(raw: unknown) {
  const value = migrationCommandSchema.parse(raw);
  if (
    value.kind === "migration.settings.stage" ||
    value.kind === "migration.settings.validate"
  ) {
    if (new TextEncoder().encode(JSON.stringify(value)).length > 192 * 1024)
      throw new Error("MG01_TRANSFER_LIMIT");
    return { ...value, source: parseSettingsSource(value.source) };
  }
  return value.kind === "migration.policy.put"
    ? { ...value, value: mg02MirrorSchema.parse(value.value) }
    : value;
}
