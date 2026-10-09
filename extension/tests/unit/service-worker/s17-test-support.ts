import { vi } from "vitest";
import type { ActSession } from "../../../src/service-worker/act-session-types.js";
import { ServiceCoordinator } from "../../../src/service-worker/coordinator.js";
import type { ActStepDependencies } from "../../../src/service-worker/act-step-dependencies.js";
import type { ProviderRuntime } from "../../../src/providers/runtime.js";
export const makeS17Test = () => {
  const coordinator = new ServiceCoordinator({
    permission_origins: ["<all_urls>"],
    page_read_origins: ["<all_urls>"],
    profile_resolver_origins: [],
    llm_egress_origins: [],
  });
  const active = {
    tabId: 1,
    origin: "https://fixture.test",
    path: "/",
    snapshot: {
      schema_version: 2 as const,
      document_epoch: "epoch-abcdefghijklmnop",
      frame_id: 0,
      visible_text: "Result",
      nodes: [
        {
          ref_id: "target-abcdefghijklmnop",
          role: "button" as const,
          name: "Run",
          state: {},
          visible: true,
          enabled: true,
        },
      ],
    },
  };
  const session: ActSession = {
    id: "session-abcdefghijklmnop",
    tabId: 1,
    origin: active.origin,
    prompt: "Run the report",
    messages: [
      { role: "system", content: "Act" },
      { role: "user", content: "Run the report" },
    ],
    profile: { id: "generic", version: 1 },
    discovery: "page-derived",
    definitions: [],
    profileDefinitions: [],
  };
  const dependencies: ActStepDependencies = {
    coordinator,
    provider: { chat: vi.fn() } as unknown as ProviderRuntime,
    preferences: () => ({
      permission_mode: "standard",
      default_read_scope: "all_dom",
      screenshot_policy: "manual_or_model",
      group_tools_in_timeline: true,
      show_tool_debug_details: false,
    }),
    readActive: vi.fn(async () => active),
    threadContext: () => [],
    pageScope: () => ({
      origin: active.origin,
      path: active.path,
      document_epoch: active.snapshot.document_epoch,
      page_scope_epoch: active.snapshot.document_epoch,
    }),
    bindRun: vi.fn(),
    publish: vi.fn(),
    serialise: JSON.stringify,
    executeApprovedProposal: vi.fn(async () => ({ ok: true })),
    endSession: vi.fn(),
  };
  return { active, session, dependencies };
};
export const executionInventory = (messages: { content: string }[]) => {
  const content = [...messages]
    .reverse()
    .find((message) =>
      message.content.startsWith("[UNTRUSTED_EXECUTION_INVENTORY]"),
    )!.content;
  return JSON.parse(content.split("\n")[1]!);
};
export const planArguments = (
  revision = 1,
  evidence = "evidence-abcdefghijklmnop",
) => ({
  request_revision: revision,
  goal: "Run report",
  evidence_ids: [evidence],
  coverage_note: "visible_only",
  provenance: "generated from current observation",
  steps: [
    {
      intent: "Run",
      capability: "propose_click",
      postcondition: "Report result visible",
      side_effects: ["report generation"],
    },
  ],
  approval_scope: "single_step",
});
