import { afterEach, expect, it, vi } from "vitest";
import { createDiagnosticsMessageHandler } from "../../../src/service-worker/diagnostics-message-handler.js";
import { ChatRequestLifecycle } from "../../../src/service-worker/chat-request-lifecycle.js";
import { ExecutionDiagnostics } from "../../../src/service-worker/execution-diagnostics.js";
import { TabChatSessionStore } from "../../../src/state/tab-chat-session-store.js";

afterEach(() => vi.unstubAllGlobals());

it.each(["development", "release"])(
  "exports captured values only in %s mode while preserving tab ownership",
  async (mode) => {
    vi.stubGlobal("__CONTEXTPILOT_DIAGNOSTICS_MODE__", mode);
    const raw = mode === "development";
    const diagnostics = new ExecutionDiagnostics();
    const requests = new ChatRequestLifecycle(diagnostics);
    const requestId = "c2f597ec-1096-4e99-8e2e-2c43b05c0dfb";
    const prompt = "DEVELOPMENT_REQUEST_PROMPT";
    requests.start({ request_id: requestId, tab_id: 7, prompt, mode: "act" });
    const chatEvents = new TabChatSessionStore();
    const scope = {
      document_epoch: "document-epoch",
      page_scope_epoch: "scope-epoch",
      origin: "https://development.example",
      path: "/private-path",
    };
    chatEvents.bindRun("run-current-aaaaaaaaaaaa", 7, scope);
    chatEvents.append("run-current-aaaaaaaaaaaa", {
      type: "user_message",
      text: "DEVELOPMENT_CHAT_TEXT",
    });
    chatEvents.bindRun("run-other-tab-aaaaaaaaaa", 8, scope);
    chatEvents.append("run-other-tab-aaaaaaaaaa", {
      type: "user_message",
      text: "OTHER_TAB_CONTENT",
    });
    const respond = vi.fn();
    createDiagnosticsMessageHandler({
      activeTab: async () => ({ id: 7 }),
      cancel: vi.fn(),
      isPanelSender: () => true,
      providerAvailable: () => true,
      requests,
      diagnostics,
      chatEvents,
      providerDiagnostics: async () => ({
        configured: true,
        config: {
          model: "fixture",
          api_key: "DEVELOPMENT_API_KEY",
          base_url: "https://development-provider.example",
        },
      }),
      sendToContentScript: async () => ({
        ok: true,
        schema_version: 1,
        document_epoch_digest: "a".repeat(43),
        page_scope_epoch_digest: "b".repeat(43),
        document: {
          ready_state: "complete",
          element_count: 1,
          role_counts: {},
          table_count: 0,
          table_shape: [],
          list_count: 0,
          form_count: 0,
          input_counts: {},
        },
        artifacts: {
          html: { bytes: 12, sha256: "c".repeat(43) },
          scripts: {
            total: 0,
            inline_count: 0,
            external_count: 0,
            total_bytes: 0,
            digests: [],
            type_counts: {},
            truncated: false,
          },
        },
        page: {
          url_shape: {
            has_query: false,
            has_fragment: false,
            path_segment_count: 1,
          },
          title_length: 4,
          referrer_present: false,
          url: "https://development-page.example/private",
          title: "DEVELOPMENT_PAGE_TITLE",
          referrer: "",
        },
      }),
      runAct: async () => ({ ok: true }),
      runAsk: async () => ({ ok: true }),
      safeFailure: (code) => ({ ok: false, code }),
    }).bundleExport(
      {
        schema_version: 1,
        kind: "DIAGNOSTICS_BUNDLE_EXPORT",
        request_id: requestId,
      },
      {},
      respond,
    );
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    const reply = respond.mock.calls[0]![0];
    expect(reply.ok).toBe(true);
    expect(reply.data).toMatchObject({
      diagnostics_mode: mode,
      diagnostics_masked: !raw,
    });
    const serialized = JSON.stringify(reply);
    for (const marker of [
      prompt,
      "DEVELOPMENT_CHAT_TEXT",
      "DEVELOPMENT_API_KEY",
      "development-provider.example",
      "development-page.example",
      "DEVELOPMENT_PAGE_TITLE",
    ])
      expect(serialized.includes(marker)).toBe(raw);
    expect(serialized).not.toContain("OTHER_TAB_CONTENT");
  },
);
