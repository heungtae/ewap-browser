import { describe, expect, it } from "vitest";
import { runtimeFixture } from "../../../fixture/s30/runtime-fixture.js";
import { digest } from "../../../../../packages/codebase-schema/src/index.js";
async function fixture() {
  const { IDBFactory } = await import("fake-indexeddb");
  const f = await runtimeFixture(new IDBFactory());
  f.adapter.snapshot.effect.business = "destructive";
  return f;
}
async function prompt(f: Awaited<ReturnType<typeof fixture>>) {
  const prepared = await f.runtime.prepare("web.fill", f.intent);
  const a = await f.runtime.requestApproval(prepared.step.id);
  if (a.kind !== "prompt") throw new Error("EXPECTED_PROMPT");
  const response = {
    promptId: a.prompt.id,
    promptRevision: a.prompt.revision,
    preparedDigest: a.prompt.preparedDigest,
    contextDigest: a.prompt.contextDigest,
    planRevision: a.prompt.planRevision,
    choice: "approve",
    disclosureScope: null,
  };
  return { prepared, a, response };
}
describe("S30 exact explicit approvals", () => {
  it("rejects forged principal and wrong prompt revision, then consumes trusted current approval", async () => {
    const f = await fixture();
    const p = await prompt(f);
    await expect(
      f.approvals.respond({ kind: "trusted-ui" }, p.response),
    ).rejects.toThrow("UI_AUTHORITY_DENIED");
    await expect(
      f.approvals.respond(f.principal, { ...p.response, promptRevision: 2 }),
    ).rejects.toThrow("PROMPT_MISMATCH");
    const approval = await f.approvals.respond(f.principal, p.response);
    expect(approval?.source).toBe("user");
    expect(
      await f.runtime.execute(p.prepared.step.id, approval!.id),
    ).toMatchObject({ verification: "passed" });
    await expect(f.approvals.respond(f.principal, p.response)).rejects.toThrow(
      "PROMPT_UNAVAILABLE",
    );
    f.db.close();
  });
  it("rejects old plan, policy, runtime epoch and cancellation generations", async () => {
    for (const field of [
      "planRevision",
      "policyRevision",
      "runtimeEpoch",
      "cancellationGeneration",
    ] as const) {
      const f = await fixture();
      const p = await prompt(f);
      f.context[field]++;
      await expect(
        f.approvals.respond(f.principal, p.response),
      ).rejects.toThrow("APPROVAL_BINDING_STALE");
      expect(f.state.dispatches).toBe(0);
      f.db.close();
    }
  });
  it("denies late responses after Stop and rejects policy changes at the same revision", async () => {
    const f = await fixture();
    const p = await prompt(f);
    f.runtime.cancel();
    await expect(f.approvals.respond(f.principal, p.response)).rejects.toThrow(
      "PROMPT_UNAVAILABLE",
    );
    f.db.close();
    const g = await fixture();
    const q = await prompt(g);
    g.policy.siteAllowed = false;
    await expect(g.approvals.respond(g.principal, q.response)).rejects.toThrow(
      "APPROVAL_BINDING_STALE",
    );
    g.db.close();
  });
  it("does not allow mutation of projected prompts or capability removal", async () => {
    const f = await fixture();
    const p = await prompt(f);
    p.a.prompt.planRevision = 999;
    const approval = await f.approvals.respond(f.principal, p.response);
    f.capabilities.clear();
    await expect(
      f.runtime.execute(p.prepared.step.id, approval!.id),
    ).rejects.toThrow("CAPABILITY_STALE");
    expect(f.state.dispatches).toBe(0);
    f.db.close();
  });
  it("rejects expired execution even if policy digest is still current", async () => {
    const f = await fixture();
    f.context.deadline = Date.now() - 1;
    f.context.policyDigest = await digest(f.policy);
    await expect(f.runtime.prepare("web.fill", f.intent)).rejects.toThrow(
      "LEASE_EXPIRED",
    );
    f.db.close();
  });
});
