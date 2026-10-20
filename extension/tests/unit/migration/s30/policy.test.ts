import { describe, expect, it } from "vitest";
import { setup } from "../../../fixture/s30/setup.js";
import { evaluate } from "../../../../../packages/policy-engine/src/index.js";
import {
  canonicalName,
  inputSchemas,
  toolIds,
  wireName,
} from "../../../../../packages/tool-registry/src/index.js";
describe("S30 inventory and policy", () => {
  it("inventories 21 tools with bijective schemas and hides unavailable owners", async () => {
    const f = await setup();
    expect(toolIds).toHaveLength(21);
    for (const id of toolIds) expect(canonicalName(wireName(id))).toBe(id);
    expect(
      (await f.registry.snapshot(f.context, f.capabilities)).tools.map(
        (t) => t.tool,
      ),
    ).toEqual(["web.fill"]);
    f.context.mode = "ask";
    expect(
      (await f.registry.snapshot(f.context, f.capabilities)).tools,
    ).toEqual([]);
    expect(() =>
      f.registry.register("analysis.run", f.registry.get("web.fill")!),
    ).toThrow("OWNING_SPRINT_UNQUALIFIED");
    expect(() =>
      inputSchemas["web.fill"].parse({
        action: f.target,
        argument: { ...f.target, kind: "argument" },
        approval: true,
      }),
    ).toThrow();
    expect(() => canonicalName("web__eval")).toThrow();
  });
  it("denies Ask edits/navigation and sensitive input, even Full", async () => {
    const f = await setup();
    expect(
      evaluate(f.policy, "web.fill", f.effect, { ...f.context, mode: "ask" }),
    ).toBe("deny");
    expect(
      evaluate(
        f.policy,
        "web.navigate",
        { ...f.effect, mechanism: "navigate" },
        { ...f.context, mode: "ask" },
      ),
    ).toBe("deny");
    expect(
      evaluate(
        f.policy,
        "web.fill",
        { ...f.effect, sensitive: true },
        f.context,
      ),
    ).toBe("deny");
    f.policy.deniedTools = ["web.fill"];
    expect(evaluate(f.policy, "web.fill", f.effect, f.context)).toBe("deny");
  });
  it("requires explicit approval for all hard risks and unknown autosave", async () => {
    const f = await setup();
    f.policy.boundedWrite = true;
    for (const business of [
      "destructive",
      "external_transfer",
      "unknown",
    ] as const)
      expect(
        evaluate(f.policy, "web.fill", { ...f.effect, business }, f.context),
      ).toBe("explicit");
    for (const risk of ["bulk", "disclosure"] as const)
      expect(
        evaluate(
          f.policy,
          "web.fill",
          { ...f.effect, [risk]: true },
          f.context,
        ),
      ).toBe("explicit");
    expect(evaluate(f.policy, "web.fill", f.effect, f.context)).toBe("policy");
  });
});
