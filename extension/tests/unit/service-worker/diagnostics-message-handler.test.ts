import { expect, it, vi } from "vitest";
import { createDiagnosticsMessageHandler } from "../../../src/service-worker/diagnostics-message-handler.js";
import { ChatRequestLifecycle } from "../../../src/service-worker/chat-request-lifecycle.js";
import { ExecutionDiagnostics } from "../../../src/service-worker/execution-diagnostics.js";
import { TabChatSessionStore } from "../../../src/state/tab-chat-session-store.js";

it("exports complete same-tab diagnostic data", async () => {
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
  requests.finish(id, run, "FAILED", "PROVIDER_UNAVAILABLE");
  const handler = createDiagnosticsMessageHandler({
    activeTab: async () => ({ id: 7 }),
    cancel: vi.fn(),
    isPanelSender: () => true,
    providerAvailable: () => true,
    requests,
    diagnostics,
    chatEvents: new TabChatSessionStore(),
    providerDiagnostics: async () => ({
      configured: true,
      model: "safe-model",
      api_key: "must-not-export",
    }),
    sendToContentScript: async () => ({
      ok: true,
      schema_version: 1,
      document_epoch_digest: "a".repeat(43),
      page_scope_epoch_digest: "b".repeat(43),
      document: {
        ready_state: "complete",
        element_count: 3,
        role_counts: {},
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
          truncated: false,
        },
      },
      page: {
        url_shape: {
          has_query: true,
          has_fragment: false,
          path_segment_count: 1,
        },
        title_length: 10,
        referrer_present: true,
      },
    }),
    runAct: async () => ({ ok: true }),
    runAsk: async () => ({ ok: true }),
    safeFailure: (code) => ({ ok: false, code }),
  });
  const respond = vi.fn();
  handler.bundleExport(
    { schema_version: 1, kind: "DIAGNOSTICS_BUNDLE_EXPORT", request_id: id },
    {},
    respond,
  );
  await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
  const exported = JSON.stringify(respond.mock.calls[0]![0]);
  expect(exported).toContain('"rows":25');
  expect(exported).toContain('"api_key_configured":true');
  expect(exported).not.toContain("must-not-export");
  expect(exported).not.toContain("do not export this prompt");
  expect(exported).not.toContain('"api_key"');
});
