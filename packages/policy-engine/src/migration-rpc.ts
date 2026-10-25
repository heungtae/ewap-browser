import { migrationCommandSchema } from "../../shared/src/migration-rpc.js";
import { mg02MirrorSchema } from "./migration-contract.js";
// The generic bridge envelope is domain-validated at both privileged endpoints.
export function parseMigrationCommand(raw: unknown) {
  const value = migrationCommandSchema.parse(raw);
  return value.kind === "migration.policy.put"
    ? { ...value, value: mg02MirrorSchema.parse(value.value) }
    : value;
}
