import { describe, expect, it, vi } from "vitest";
import { authorizeActWithEvidence } from "../../../src/service-worker/act-policy-evidence.js";
import { ContractError } from "../../../src/security/validation.js";
import type { ActSession } from "../../../src/service-worker/act-session-types.js";
import type { Run } from "../../../src/state/run-coordinator.js";
import type { AuditEvent } from "../../../src/security/audit.js";

const run = {
  id: "run-1",
  tabId: 1,
  documentEpoch: "epoch-1",
} as Run;
const session = {
  origin: "https://portal.company.test",
  profile: { id: "private profile", version: 2 },
  workflow: { declaration: { id: "private workflow" } },
} as ActSession;

describe("Act policy evidence", () => {
  it("keeps_an_outage_code_without_a_false_deny_decision_or_raw_ids", async () => {
    const evidence = vi.fn(async (_event: AuditEvent) => "FAILED");
    await expect(
      authorizeActWithEvidence({
        run,
        session,
        capability: "click",
        risk: "R2",
        authorizeEnterprise: async () => {
          throw new ContractError("ENTERPRISE_POLICY_UNAVAILABLE");
        },
        evidence,
      }),
    ).rejects.toThrow("ENTERPRISE_POLICY_UNAVAILABLE");
    expect(evidence).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        event: "policy",
        run_id: run.id,
        code: "ENTERPRISE_POLICY_UNAVAILABLE",
        stage: "requested",
      }),
    );
    expect(evidence.mock.calls[0]?.[0]).not.toHaveProperty("decision");
    expect(JSON.stringify(evidence.mock.calls)).not.toContain(
      "private profile",
    );
    expect(JSON.stringify(evidence.mock.calls)).not.toContain(
      "private workflow",
    );
  });
});
