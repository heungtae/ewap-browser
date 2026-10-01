import { expect, it, vi } from "vitest";
import { createDiagnosticsMessageHandler } from "../../../src/service-worker/diagnostics-message-handler.js";
import { ChatRequestLifecycle } from "../../../src/service-worker/chat-request-lifecycle.js";
import { ExecutionDiagnostics } from "../../../src/service-worker/execution-diagnostics.js";
import { TabChatSessionStore } from "../../../src/state/tab-chat-session-store.js";

it.each([
  "normal",
  "extra-url",
  "bad-digest",
  "bad-count-key",
  "truncated",
  "content-failure",
  "provider-failure",
  "navigation",
  "missing-request",
  "no-id",
])("exports isolated redacted diagnostics: %s", async (scenario) => {
  const diagnostics = new ExecutionDiagnostics();
  diagnostics.setLevel("trace");
  const requests = new ChatRequestLifecycle(diagnostics);
  const id = "c2f597ec-1096-4e99-8e2e-2c43b05c0dfb";
  requests.start({
    request_id: id,
    tab_id: 7,
    prompt: "do not export this prompt",
    mode: "ask",
  });
  const run = requests.startRun(id)!;
  requests.finish(
    id,
    run,
    scenario === "navigation" ? "UNKNOWN" : "FAILED",
    scenario === "navigation"
      ? "NAVIGATION_UNVERIFIED"
      : "PROVIDER_UNAVAILABLE",
  );
  const otherId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  requests.start({
    request_id: otherId,
    tab_id: 7,
    prompt: "other secret prompt",
    mode: "ask",
  });
  const handler = createDiagnosticsMessageHandler({
    activeTab: async () => ({ id: 7 }),
    cancel: vi.fn(),
    isPanelSender: () => true,
    providerAvailable: () => true,
    requests,
    diagnostics,
    chatEvents: new TabChatSessionStore(),
    providerDiagnostics: async () => {
      if (scenario === "provider-failure") throw new Error("secret failure");
      return {
        configured: true,
        model: "safe-model",
        api_key: "must-not-export",
      };
    },
    sendToContentScript: async () => {
      if (scenario === "content-failure") throw new Error("secret failure");
      return {
        ok: true,
        schema_version: 1,
        document_epoch_digest:
          scenario === "bad-digest" ? "must-not-export" : "a".repeat(43),
        page_scope_epoch_digest: "b".repeat(43),
        document: {
          ready_state: "complete",
          element_count: 3,
          role_counts:
            scenario === "bad-count-key" ? { "must-not-export": 1 } : {},
          table_count: 1,
          table_shape: [{ rows: 25, columns: 6 }],
          list_count: 0,
          form_count: 0,
          input_counts: { input: 0 },
        },
        artifacts: {
          html: { bytes: 42, sha256: "c".repeat(43) },
          scripts: {
            total: 1,
            inline_count: 1,
            external_count: 0,
            total_bytes: 12,
            digests: ["d".repeat(43)],
            type_counts: { classic: 1 },
            truncated: scenario === "truncated",
          },
        },
        page: {
          url_shape: {
            has_query: true,
            has_fragment: false,
            path_segment_count: 1,
            ...(scenario === "extra-url" ? { url: "must-not-export" } : {}),
          },
          title_length: 10,
          referrer_present: true,
        },
      };
    },
    runAct: async () => ({ ok: true }),
    runAsk: async () => ({ ok: true }),
    safeFailure: (code) => ({ ok: false, code }),
  });
  const respond = vi.fn();
  handler.bundleExport(
    {
      schema_version: 1,
      kind: "DIAGNOSTICS_BUNDLE_EXPORT",
      ...(scenario === "no-id"
        ? {}
        : {
            request_id:
              scenario === "missing-request"
                ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
                : id,
          }),
    },
    {},
    respond,
  );
  await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
  const exported = JSON.stringify(respond.mock.calls[0]![0]);
  const response = respond.mock.calls[0]![0];
  expect(response.ok).toBe(true);
  if (scenario !== "no-id") expect(exported).not.toContain(otherId);
  if (scenario === "no-id" || scenario === "missing-request")
    expect(response.data.sections.request.code).toBe(
      scenario === "no-id" ? "REQUEST_ID_NOT_PROVIDED" : "REQUEST_NOT_FOUND",
    );
  if (scenario === "navigation")
    expect(response.data.sections.request.data).toMatchObject({
      outcome: "UNKNOWN",
      code: "NAVIGATION_UNVERIFIED",
    });
  expect(response.data.sections.execution_trace.status).toBe("collected");
  if (["bad-digest", "bad-count-key", "content-failure"].includes(scenario))
    expect(response.data.sections.page.status).toBe("unavailable");
  else {
    expect(exported).toContain('"rows":25');
    expect(response.data.sections.page.status).toBe(
      scenario === "truncated" ? "truncated" : "collected",
    );
  }
  if (scenario === "provider-failure")
    expect(response.data.sections.llm_processing.status).toBe("unavailable");
  else expect(exported).toContain('"api_key_configured":true');
  expect(exported).not.toContain("secret failure");
  expect(exported).not.toContain("must-not-export");
  expect(exported).not.toContain("do not export this prompt");
  expect(exported).not.toContain('"api_key"');
});
