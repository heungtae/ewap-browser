import { createHash } from "node:crypto";
import { canonicalJson } from "../../../../extension/src/security/canonical.js";
import {
  mg02MirrorSchema,
  type PolicyMirror,
  type PolicyMirrorAck,
  type PolicyMirrorPort,
} from "../../../../packages/policy-engine/src/migration-contract.js";
import { transaction, type Sqlite } from "../tasks/database.js";
const digest = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
function parse(value: unknown): PolicyMirror {
  const result = mg02MirrorSchema.safeParse(value);
  if (
    !result.success ||
    result.data.checkpoint.targetDigest !== digest(result.data.conversion)
  )
    throw new Error("MG02_MIRROR_INVALID");
  return result.data;
}
export class SqlitePolicyMirror implements PolicyMirrorPort {
  constructor(
    private readonly db: Sqlite,
    private readonly profileGuard: string,
  ) {
    if (!/^[a-f0-9]{64}$/.test(profileGuard)) throw new Error("MG02_PROFILE");
    db.exec(`CREATE TABLE IF NOT EXISTS mg02_policy_mirror
      (profile_guard TEXT NOT NULL,migration_id TEXT NOT NULL,body TEXT NOT NULL,
       PRIMARY KEY(profile_guard,migration_id));`);
  }
  private fence(epoch: number) {
    let row: Record<string, unknown> | undefined;
    try {
      row = this.db
        .prepare("SELECT epoch,admission FROM migration_fence WHERE id=1")
        .get();
    } catch {
      throw new Error("MG02_FENCE_REQUIRED");
    }
    if (!row || row.epoch !== epoch || row.admission !== 0)
      throw new Error("MG02_FENCE_REQUIRED");
  }
  private load(profile: string, id: string) {
    const row = this.db
      .prepare(
        "SELECT body FROM mg02_policy_mirror WHERE profile_guard=? AND migration_id=?",
      )
      .get(profile, id);
    if (!row) return undefined;
    let value: unknown;
    try {
      value = JSON.parse(String(row.body));
    } catch {
      throw new Error("MG02_MIRROR_INVALID");
    }
    const parsed = parse(value);
    if (parsed.profileGuard !== profile || parsed.migrationId !== id)
      throw new Error("MG02_MIRROR_INVALID");
    return parsed;
  }
  private ack(value: PolicyMirror): PolicyMirrorAck {
    return {
      schema: "wca.mg02-ack/v1",
      profileGuard: value.profileGuard,
      migrationId: value.migrationId,
      epoch: value.epoch,
      policyRevision: value.policyRevision,
      manifestDigest: digest(value),
    };
  }
  async put(raw: PolicyMirror) {
    const value = parse(raw);
    if (value.profileGuard !== this.profileGuard)
      throw new Error("MG02_PROFILE");
    return transaction(this.db, () => {
      this.fence(value.epoch);
      const old = this.load(value.profileGuard, value.migrationId);
      if (old && digest(old) !== digest(value))
        throw new Error("MG02_MIRROR_CONFLICT");
      if (!old)
        this.db
          .prepare("INSERT INTO mg02_policy_mirror VALUES (?,?,?)")
          .run(value.profileGuard, value.migrationId, JSON.stringify(value));
      return this.ack(value);
    });
  }
  async read(profile: string, id: string, epoch: number) {
    if (profile !== this.profileGuard) throw new Error("MG02_PROFILE");
    this.fence(epoch);
    const value = this.load(profile, id);
    if (!value) return undefined;
    if (value.epoch !== epoch) throw new Error("MG02_MIRROR_STALE");
    return this.ack(value);
  }
}
