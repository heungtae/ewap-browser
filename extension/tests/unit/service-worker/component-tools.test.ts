import { describe, expect, it, vi } from "vitest";
import { createComponentToolExecutor } from "../../../src/service-worker/component-tools.js";
import {
  createActHarnessReadExecutor,
  runHarnessReadTurns,
} from "../../../src/service-worker/act-harness-turns.js";
import { buildComponentDescriptor } from "../../../src/page-act-harness/component-descriptor.js";
import type { BrowserTabs } from "../../../src/service-worker/browser-api.js";
import type { ProviderMessage } from "../../../src/providers/types.js";
const id = "component-abcdefghijklmnop",
  revision = "revision-abcdefghijklmnop";
const setup = () => {
  let current = true,
    version = revision;
  const descriptor = buildComponentDescriptor({
    resource_id: id,
    binding_revision: revision,
    observed_hint: "table",
    hint_basis: "tag:table",
    visible_count: 3,
    logical_count: 3,
    total_count: 3,
    has_eof: true,
    channels: [
      { channel: "visible_rows", available: true },
      { channel: "reviewed_data", available: false },
      { channel: "description", available: true },
    ],
  });
  const tabs = {
    sendMessage: vi.fn(async (_id: number, message: unknown) => {
      const request = message as Record<string, unknown>;
      return request.resource_revision !== version
        ? { status: "STALE" }
        : {
            status: "AVAILABLE",
            document_epoch: "epoch",
            descriptor: structuredClone(descriptor),
            rows: [
              { name: "a", api_key: "S19_PRIVATE" },
              { name: "b" },
              { name: "c" },
            ],
            description: "mounted rows",
          };
    }),
  } as unknown as BrowserTabs;
  const executor = createComponentToolExecutor({
    tabs,
    tabId: 1,
    runId: "run",
    documentEpoch: "epoch",
    requestRevision: 1,
    current: () => current,
    consent: async () => true,
    allowCollection: () => false,
    visionEnabled: false,
  });
  const execute = (
    args: Record<string, unknown>,
    name = "read_component_data",
  ) =>
    executor.execute({
      name,
      args: JSON.stringify({
        resource_id: id,
        resource_revision: revision,
        ...args,
      }),
    }) as Promise<Record<string, unknown>>;
  return {
    execute,
    tabs,
    executor,
    stop: () => {
      current = false;
    },
    change: () => {
      version = "changed";
    },
  };
};
describe("S19 component tool runtime", () => {
  it("masks values and binds continuation to the selected component/channel/revision", async () => {
    const test = setup();
    const first = await test.execute({ channel: "visible_rows", max_items: 2 });
    expect(JSON.stringify(first)).not.toContain("S19_PRIVATE");
    expect(first.coverage).toMatchObject({
      complete: false,
      supplied_count: 2,
    });
    const next = (first.continuation as { arguments: Record<string, unknown> })
      .arguments;
    expect((await test.execute(next)).coverage).toMatchObject({
      complete: false,
      supplied_count: 1,
      window_offset: 2,
    });
    expect(
      await test.execute({ ...next, channel: "description" }),
    ).toMatchObject({ code: "INVALID_CURSOR" });
    test.change();
    expect(await test.execute(next)).toMatchObject({ status: "STALE" });
  });
  it("rejects unsupported channels and malformed arguments without inventing data", async () => {
    const test = setup();
    expect(await test.execute({ channel: "reviewed_data" })).toMatchObject({
      status: "UNSUPPORTED",
    });
    expect(
      await test.execute({ channel: "visible_rows", selector: "#secret" }),
    ).toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(
      await test.execute({ channel: "visible_rows", max_items: "2" }),
    ).toMatchObject({ code: "INVALID_MAX_ITEMS" });
    test.stop();
    expect(await test.execute({ channel: "visible_rows" })).toMatchObject({
      status: "CANCELLED",
    });
  });
  it("returns a read result on the same call ID before the next model turn", async () => {
    const test = setup(),
      messages: ProviderMessage[] = [];
    let round = 0;
    const result = await runHarnessReadTurns({
      messages,
      expectedRevision: 1,
      readNames: ["read_component_data"],
      offeredTools: [],
      serialise: JSON.stringify,
      executeRead: (call) => test.executor.execute(call),
      chat: async () => {
        if (round++ === 0)
          return {
            content: "",
            tool_calls: [
              {
                id: "call-component-abcdefghijkl",
                name: "read_component_data",
                arguments: JSON.stringify({
                  resource_id: id,
                  resource_revision: revision,
                  channel: "visible_rows",
                }),
              },
            ],
          };
        expect(messages.at(-1)).toMatchObject({
          role: "tool",
          tool_call_id: "call-component-abcdefghijkl",
        });
        expect(messages.at(-1)?.content).not.toContain("S19_PRIVATE");
        return { content: "grounded answer", tool_calls: [] };
      },
    });
    expect(result.content).toBe("grounded answer");
  });
  it("offers component executors only with document binding and suppresses disabled vision", () => {
    const executor = createActHarnessReadExecutor({
      snapshot: {
        document_epoch: "epoch",
        nodes: [],
        visible_text: "",
        frame_id: 0,
      },
      tabId: 1,
      runId: "run",
      assist: { tabs: setup().tabs, redactTitle: (s) => s ?? "" },
    });
    expect(executor.tools.map((tool) => tool.function.name)).not.toContain(
      "describe_component",
    );
    expect(executor.tools.map((tool) => tool.function.name)).not.toContain(
      "screenshot",
    );
  });
});
