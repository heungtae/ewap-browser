import { expect, it } from "vitest";
import { setup } from "../../../fixture/s30/setup.js";
import { toolIds } from "../../../../../packages/tool-registry/src/index.js";
import { evaluateMigratedPolicy } from "../../../../../packages/policy-engine/src/migration-evaluate.js";
import { convertMg02 } from "../../../../../apps/chrome-extension/src/migration/mg02-convert.js";
import { draftPolicy, permission, preferences } from "./mg02-support.js";
async function request() {
  const f = await setup();
  return {
    tool: "web.fill" as const,
    effect: f.effect,
    context: f.context,
    url: "https://example.test/form",
    freshSiteConsent: true,
    planApproved: true,
    visionRequested: false,
    manualVisionRequest: false,
    readScope: "all_dom" as const,
  };
}
it("does not turn imported allows or Full into policy-issued approvals across all 21 tools", async () => {
  const source = preferences();
  source.approval_policy.mode = "full";
  const policy = convertMg02({
    agent_preferences: source,
    contextpilot_permissions: [permission("allow", "type")],
  });
  const input = await request();
  for (const tool of toolIds)
    expect(evaluateMigratedPolicy(policy, { ...input, tool })).not.toBe(
      "policy",
    );
  expect(evaluateMigratedPolicy(policy, input)).toBe("explicit");
});
it("explicit host/category denies beat conflicting allows, including legacy alias denies", async () => {
  const input = await request();
  const source = preferences();
  source.approval_policy.mode = "custom";
  const policy = convertMg02({
    agent_preferences: source,
    contextpilot_permissions: [permission("allow", "type")],
    wb_permissions: [permission("deny", "type")],
  });
  expect(evaluateMigratedPolicy(policy, input)).toBe("deny");
  source.approval_policy.categories.action_execution = "deny";
  expect(
    evaluateMigratedPolicy(convertMg02({ agent_preferences: source }), input),
  ).toBe("deny");
});
it("retains Ask/sensitive hard denial and explicit approval for every hard business risk", async () => {
  const policy = draftPolicy();
  const input = await request();
  expect(
    evaluateMigratedPolicy(policy, {
      ...input,
      context: { ...input.context, mode: "ask" },
    }),
  ).toBe("deny");
  expect(
    evaluateMigratedPolicy(policy, {
      ...input,
      effect: { ...input.effect, sensitive: true },
    }),
  ).toBe("deny");
  for (const business of [
    "destructive",
    "external_transfer",
    "unknown",
    "write",
  ] as const)
    expect(
      evaluateMigratedPolicy(policy, {
        ...input,
        effect: { ...input.effect, business },
      }),
    ).toBe("explicit");
});
it("requires fresh site consent and current policy revision instead of replaying stored scope", async () => {
  const policy = draftPolicy();
  const input = await request();
  expect(
    evaluateMigratedPolicy(policy, { ...input, freshSiteConsent: false }),
  ).toBe("deny");
  expect(
    evaluateMigratedPolicy(policy, {
      ...input,
      context: { ...input.context, policyRevision: 0 },
    }),
  ).toBe("deny");
  const plan = preferences();
  plan.approval_policy.mode = "custom";
  plan.approval_policy.tool_scope = "approved_plan";
  expect(
    evaluateMigratedPolicy(convertMg02({ agent_preferences: plan }), {
      ...input,
      planApproved: false,
    }),
  ).toBe("deny");
});
it("retains read-scope ceilings, page-method disable and manual vision/disclosure constraints", async () => {
  const input = await request();
  const policy = draftPolicy();
  policy.preferences.defaultReadScope = "interactive";
  const read = {
    ...input,
    tool: "web.extract" as const,
    effect: {
      ...input.effect,
      mechanism: "read" as const,
      business: "read_only" as const,
    },
  };
  expect(evaluateMigratedPolicy(policy, read)).toBe("deny");
  expect(
    evaluateMigratedPolicy(policy, { ...read, readScope: "interactive" }),
  ).toBe("explicit");
  const normal = draftPolicy();
  expect(
    evaluateMigratedPolicy(normal, { ...input, visionRequested: true }),
  ).toBe("deny");
  expect(
    evaluateMigratedPolicy(normal, {
      ...input,
      visionRequested: true,
      manualVisionRequest: true,
    }),
  ).toBe("explicit");
  normal.preferences.categories.vision_disclosure = "deny";
  expect(
    evaluateMigratedPolicy(normal, {
      ...input,
      effect: { ...input.effect, disclosure: true },
    }),
  ).toBe("deny");
  normal.preferences.pageMethodEnabled = false;
  expect(
    evaluateMigratedPolicy(normal, { ...input, tool: "web.invoke_action" }),
  ).toBe("deny");
});

it("keeps original scheme/host restrictions even with fresh consent", async () => {
  const input = await request();
  const policy = draftPolicy();
  for (const url of [
    "chrome://settings",
    "https://192.168.1.1/",
    "https://intranet/",
    "https://x.localhost/",
  ])
    expect(evaluateMigratedPolicy(policy, { ...input, url })).toBe("deny");
  expect(
    evaluateMigratedPolicy(policy, { ...input, url: "http://127.0.0.1/form" }),
  ).toBe("explicit");
});
it("retains method/network return-data denies even when a caller omits the disclosure flag", async () => {
  const input = await request();
  const policy = draftPolicy();
  policy.preferences.categories.runtime_data_disclosure = "deny";
  for (const tool of ["web.invoke_action", "web.get_observed_api"] as const)
    expect(
      evaluateMigratedPolicy(policy, {
        ...input,
        tool,
        effect: { ...input.effect, disclosure: false },
      }),
    ).toBe("deny");
});
