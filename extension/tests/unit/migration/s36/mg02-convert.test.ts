import { expect, it } from "vitest";
import { CAPABILITIES } from "../../../../src/policy/permission-manager.js";
import { approvalCategories } from "../../../../src/policy/approval-policy.js";
import {
  legacyCapabilities,
  migratedCategories,
  mg02PolicySchema,
} from "../../../../../packages/policy-engine/src/migration-contract.js";
import { convertMg02 } from "../../../../../apps/chrome-extension/src/migration/mg02-convert.js";
import { permission, preferences } from "./mg02-support.js";
it("pins the versioned migration vocabulary to current source capability/category contracts", () => {
  expect(legacyCapabilities).toEqual(CAPABILITIES);
  expect(migratedCategories).toEqual(approvalCategories);
});
it("retains current/legacy denies and downgrades all persistent allows to fresh approval", () => {
  const raw = {
    contextpilot_permissions: [
      permission("allow"),
      permission("deny", "click"),
    ],
    wb_permissions: [
      permission("deny", "type"),
      permission("allow", "navigate"),
    ],
  };
  const before = structuredClone(raw);
  const value = convertMg02(raw);
  expect(mg02PolicySchema.parse(value).records).toHaveLength(4);
  expect(
    value.records
      .filter((row) => row.kind === "permission")
      .map((row) => row.decision),
  ).toEqual(["ask", "deny", "deny", "ask"]);
  expect(
    value.records.every(
      (row) => row.kind !== "permission" || row.reusableGrant === false,
    ),
  ).toBe(true);
  expect(raw).toEqual(before);
});
it("uses legacy permissions when current is absent and blocks malformed active records", () => {
  expect(convertMg02({ wb_permissions: [permission()] }).blocked).toBe(false);
  expect(
    convertMg02({
      contextpilot_permissions: [
        permission(),
        { ...permission(), host: "*.example.test" },
      ],
    }),
  ).toMatchObject({ blocked: true, sourceCount: 2 });
  expect(
    convertMg02({
      contextpilot_permissions: [],
      wb_permissions: "corrupt inactive",
    }).blocked,
  ).toBe(false);
  expect(
    convertMg02({
      contextpilot_permissions: null,
      wb_permissions: [permission()],
    }).blocked,
  ).toBe(true);
});
it("preserves page-method deny while rejecting reusable page-method grants", () => {
  const value = convertMg02({
    contextpilot_permissions: [permission("deny", "page_method")],
  });
  expect(value.blocked).toBe(false);
  expect(value.records[0]).toMatchObject({
    decision: "deny",
    capability: "page_method",
  });
  expect(
    convertMg02({
      contextpilot_permissions: [permission("allow", "page_method")],
    }).blocked,
  ).toBe(true);
});
it("never imports Full/auto, and retains explicitly declared category denies even in Full mode", () => {
  const source = preferences();
  source.approval_policy.mode = "full";
  source.approval_policy.categories.action_execution = "deny";
  source.permission_mode = "skip_all_permission_checks";
  const value = convertMg02({ agent_preferences: source });
  expect(value.preferences).toMatchObject({
    policyRevision: 1,
    mode: "custom",
    screenshotPolicy: "manual_only",
    categories: { action_execution: "deny", tool_permission: "ask" },
  });
  expect(Object.values(value.preferences.categories)).not.toContain("auto");
});
it("keeps approved-plan/read/display constraints and blocks malformed or exhausted preferences", () => {
  const source = preferences();
  source.approval_policy.mode = "custom";
  source.approval_policy.tool_scope = "approved_plan";
  source.approval_policy.revision = 7;
  source.default_read_scope = "interactive";
  source.screenshot_policy = "disabled";
  source.page_method_enabled = false;
  expect(convertMg02({ agent_preferences: source }).preferences).toMatchObject({
    policyRevision: 8,
    toolScope: "approved_plan",
    defaultReadScope: "interactive",
    screenshotPolicy: "disabled",
    pageMethodEnabled: false,
  });
  source.approval_policy.revision = Number.MAX_SAFE_INTEGER;
  expect(convertMg02({ agent_preferences: source }).blocked).toBe(true);
  expect(
    convertMg02({ agent_preferences: { permission_mode: "full" } }).blocked,
  ).toBe(true);
});
it("handles v1 category sets and old follow-plan mode without importing session/once grants", () => {
  const source = preferences();
  const { runtime_data_disclosure: _runtime, ...categories } =
    source.approval_policy.categories;
  const v1 = {
    ...source,
    approval_policy: { ...source.approval_policy, version: 1, categories },
  };
  expect(
    convertMg02({ agent_preferences: v1 }).preferences.categories
      .runtime_data_disclosure,
  ).toBe("ask");
  const { approval_policy: _approval, ...legacy } = source;
  legacy.permission_mode = "follow_a_plan";
  expect(convertMg02({ agent_preferences: legacy }).preferences).toMatchObject({
    toolScope: "approved_plan",
    categories: { tool_permission: "ask" },
  });
  expect(
    convertMg02({
      contextpilot_permissions: [{ ...permission("allow"), duration: "once" }],
    }).blocked,
  ).toBe(true);
});
