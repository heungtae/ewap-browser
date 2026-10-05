import { describe, expect, it, vi } from "vitest";
import { ContractError } from "../../../src/security/validation.js";
import { createActChatStart } from "../../../src/service-worker/act-chat-start.js";

const active = () => ({
  tabId: 7,
  origin: "https://reports.company.test",
  path: "/daily",
  snapshot: {
    schema_version: 2,
    document_epoch: "epoch-abcdefghijklmnop",
    frame_id: 0,
    visible_text: "Daily report",
    nodes: [
      {
        ref_id: "node-abcdefghijklmnop",
        role: "textbox",
        name: "Search query",
        state: {},
        visible: true,
        enabled: true,
      },
    ],
  },
});

const deps = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  pageScope: (a: { snapshot: { document_epoch: string } }) => ({
    document_epoch: a.snapshot.document_epoch,
    page_scope_epoch: "scope-abcdefghijklmnop",
    origin: "https://reports.company.test",
    path: "/daily",
  }),
  readActive: async () => active(),
  resolveProfile: async () => {
    throw new ContractError("PROFILE_UNAVAILABLE", "resolver_not_configured");
  },
  candidates: async () => [],
  createId: () => "session-abcdefghijkl",
  selections: new Map(),
  persistSelections: async () => undefined,
  sessions: new Map(),
  startActivity: () => "activity-abcdefghijkl",
  progressActivity: () => undefined,
  finishActivity: () => undefined,
  runStep: vi.fn(async (session: { harnessCapabilities?: unknown }) => ({
    ok: true,
    harnessCapabilities: session.harnessCapabilities ?? null,
  })),
  route: async () => "ACTION_REQUIRED",
  runReadOnly: async () => ({ ok: true }),
  ...overrides,
});

describe("Act chat start harness wiring", () => {
  it("attaches_harness_capabilities_when_ids_are_bindable", async () => {
    const runStep = vi.fn(
      async (session: { harnessCapabilities?: unknown }) => ({
        ok: true,
        harnessCapabilities: session.harnessCapabilities ?? null,
      }),
    );
    const start = createActChatStart({
      ...deps({ runStep }),
    } as never);
    const result = (await start(
      { mode: "act", prompt: "Search query에 browser test를 입력해줘." },
      {
        requestId: "request-abcdefghijklmnop",
        generation: 1,
        tabId: 7,
        signal: new AbortController().signal,
        check: () => undefined,
      },
    )) as { harnessCapabilities: unknown };
    expect(result.harnessCapabilities).toMatchObject({
      request_revision: 2,
      propose_tools: ["propose_set_text"],
    });
  });

  it("proceeds_untracked_without_a_bindable_request_id", async () => {
    const runStep = vi.fn(
      async (session: { harnessCapabilities?: unknown }) => ({
        ok: true,
        harnessCapabilities: session.harnessCapabilities ?? null,
      }),
    );
    const start = createActChatStart({
      ...deps({ runStep }),
    } as never);
    const result = (await start({
      mode: "act",
      prompt: "Search query에 browser test를 입력해줘.",
    })) as { harnessCapabilities: unknown };
    expect(result.harnessCapabilities).toBeNull();
  });
});
