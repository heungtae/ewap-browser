import { describe, expect, it, vi } from "vitest";
import { createActStepRunner } from "../../../src/service-worker/act-step-runner.js";
import { decideSourceConsent } from "../../../src/service-worker/source-consent.js";
import { ServiceCoordinator } from "../../../src/service-worker/coordinator.js";
import { isErrorCode } from "../../../src/contracts/error-codes.js";
import type { ProviderRuntime } from "../../../src/providers/runtime.js";
import type { ActSession } from "../../../src/service-worker/act-session-types.js";

describe("source search incomplete terminal", () => {
  it("publishes UNKNOWN with an actionable reason and suppresses unsupported model prose", async () => {
    const epoch = "epoch-abcdefghijklmnop";
    const coordinator = new ServiceCoordinator({
      permission_origins: ["<all_urls>"],
      page_read_origins: ["<all_urls>"],
      profile_resolver_origins: [],
      llm_egress_origins: [],
    });
    const publish = vi.fn((runId: string, event: Record<string, unknown>) => {
      if (event.type === "source_consent_required")
        decideSourceConsent(String(event.request_id), runId, true);
    });
    let turn = 0;
    const dispatch = vi.fn();
    const endSession = vi.fn();
    const runner = createActStepRunner({
      coordinator,
      provider: {
        chat: async () =>
          turn++ === 0
            ? {
                content: "",
                tool_calls: [
                  {
                    id: "call-search-abcdefghijkl",
                    name: "search_page_resources",
                    arguments: JSON.stringify({
                      query: "missingFunction",
                      page_size: 1,
                    }),
                  },
                ],
              }
            : {
                content: "missingFunction does not exist anywhere.",
                tool_calls: [],
              },
      } as unknown as ProviderRuntime,
      preferences: () => ({
        permission_mode: "standard",
        default_read_scope: "all_dom",
        screenshot_policy: "manual_or_model",
        group_tools_in_timeline: true,
        show_tool_debug_details: false,
      }),
      readActive: async () => ({
        tabId: 1,
        origin: "https://fixture.test",
        path: "/",
        snapshot: {
          schema_version: 2,
          document_epoch: epoch,
          frame_id: 0,
          visible_text: "Report",
          nodes: [],
        },
      }),
      readAssist: {
        redactTitle: (value) => value ?? "",
        tabs: {
          sendMessage: async (
            _tab: number,
            message: Record<string, unknown>,
          ) =>
            message.kind === "CONTENT_PAGE_RESOURCES"
              ? {
                  document_epoch: epoch,
                  revision: "inventory-v1",
                  total_count: 2,
                  truncated: false,
                  items: [0, 1].map((index) => ({
                    resource_id: `resource-abcdefghijkl${index}`,
                    revision: "inline-v1",
                    kind: "inline_script",
                    byte_length: 20,
                    readable: true,
                  })),
                }
              : {
                  status: "AVAILABLE",
                  document_epoch: epoch,
                  inventory_revision: "inventory-v1",
                  resource_id: message.resource_id,
                  revision: "body-v1",
                  body: "// unrelated source",
                },
        } as never,
      },
      threadContext: () => [],
      pageScope: () => "scope" as never,
      bindRun: () => undefined,
      publish,
      serialise: JSON.stringify,
      executeApprovedProposal: dispatch,
      endSession,
    });
    const session: ActSession = {
      id: "session-abcdefghijkl",
      sourceReadOnly: true,
      tabId: 1,
      origin: "https://fixture.test",
      prompt: "Find a source function",
      messages: [{ role: "system", content: "system" }],
      profile: { id: "profile", version: 1 },
      discovery: "page-derived",
      definitions: [],
      profileDefinitions: [],
    };
    expect(await runner.runStep(session)).toMatchObject({
      ok: true,
      state: "INCOMPLETE",
      reason: "SOURCE_SEARCH_INCOMPLETE",
    });
    expect(coordinator.runs.byId(session.runId!)?.outcome).toBe("UNKNOWN");
    expect(
      publish.mock.calls.some(
        ([, event]) =>
          event.type === "run_terminal" &&
          event.outcome === "UNKNOWN" &&
          event.code === "SOURCE_SEARCH_INCOMPLETE",
      ),
    ).toBe(true);
    expect(JSON.stringify(publish.mock.calls)).not.toContain(
      "does not exist anywhere",
    );
    expect(isErrorCode("SOURCE_SEARCH_INCOMPLETE")).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
    expect(endSession).toHaveBeenCalledWith(session);
  });
});
