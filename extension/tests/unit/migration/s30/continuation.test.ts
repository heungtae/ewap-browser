import { describe, expect, it } from "vitest";
import { runtimeFixture } from "../../../fixture/s30/runtime-fixture.js";
import { ToolContinuation } from "../../../../../apps/chrome-extension/src/runtime/continuation.js";
import { installTools } from "../../../../../apps/chrome-extension/src/runtime/install-tools.js";
import { ToolRegistry } from "../../../../../packages/tool-registry/src/index.js";
describe("S30 registered continuation", () => {
  it("routes the real handler through approval, preserving the originating tool call", async () => {
    const { IDBFactory } = await import("fake-indexeddb");
    const f = await runtimeFixture(new IDBFactory());
    f.adapter.snapshot.effect.business = "unknown";
    // Same schema/capability revision and one registered tool preserves the fixture snapshot.
    f.ports.registry = new ToolRegistry();
    const continuation = new ToolContinuation(f.runtime, f.approvals);
    installTools(f.ports.registry, continuation, new Set(["web.fill"]));
    const handler = f.ports.registry.get("web.fill")!;
    const pending = await handler.execute(f.intent, f.context);
    expect(pending.status).toBe("pending");
    const prompt = pending.data as {
      id: string;
      revision: number;
      preparedDigest: string;
      contextDigest: string;
      planRevision: number;
    };
    const receipt = await continuation.respond(f.principal, {
      promptId: prompt.id,
      promptRevision: prompt.revision,
      preparedDigest: prompt.preparedDigest,
      contextDigest: prompt.contextDigest,
      planRevision: prompt.planRevision,
      choice: "approve",
      disclosureScope: null,
    });
    expect(receipt?.toolCallId).toBe(pending.toolCallId);
    expect(receipt?.verification).toBe("passed");
    expect(
      await handler.verify(f.intent, f.context, {
        ...pending,
        status: "completed",
        data: receipt,
      }),
    ).toBe(true);
    await expect(
      handler.execute(f.intent, { ...f.context, planRevision: 2 }),
    ).rejects.toThrow("INVOCATION_STALE");
    f.db.close();
  });
});
