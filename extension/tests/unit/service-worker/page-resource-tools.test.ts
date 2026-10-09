import { describe, expect, it, vi } from "vitest";
import { createPageResourceExecutor } from "../../../src/service-worker/page-resource-tools.js";
import { createActReadToolRegistry } from "../../../src/service-worker/act-read-tool-registry.js";
import {
  decideSourceConsent,
  requestSourceConsent,
} from "../../../src/service-worker/source-consent.js";
import { runHarnessReadTurns } from "../../../src/service-worker/act-harness-turns.js";
import type { BrowserTabs } from "../../../src/service-worker/browser-api.js";
import type { ProviderMessage } from "../../../src/providers/types.js";

const id = "_resource-abcdefghijklmnop";
const setup = (allow = true) => {
  let revision = "inventory-v1";
  let current = true;
  const body =
    'function locateReport() { return 42; }\nconst api_key = "RAW_SOURCE_SECRET";\n' +
    "z".repeat(200);
  const sendMessage = vi.fn(async (_tab: number, message: unknown) => {
    const input = message as Record<string, unknown>;
    return input.kind === "CONTENT_PAGE_RESOURCES"
      ? {
          document_epoch: "epoch",
          revision,
          items: [
            {
              resource_id: id,
              revision: "inline-v1",
              kind: "inline_script",
              byte_length: body.length,
              readable: true,
            },
          ],
          total_count: 1,
          truncated: false,
        }
      : {
          status: "AVAILABLE",
          document_epoch: "epoch",
          inventory_revision: revision,
          resource_id: id,
          revision: "body-v1",
          body,
        };
  });
  const consent = vi.fn(async () => allow);
  const executor = createPageResourceExecutor({
    tabs: { sendMessage } as unknown as BrowserTabs,
    tabId: 1,
    documentEpoch: "epoch",
    requestRevision: 1,
    current: () => current,
    consent,
  });
  const execute = (name: string, args: Record<string, unknown>) =>
    executor.execute({ name, args: JSON.stringify(args) }) as Promise<
      Record<string, unknown>
    >;
  return {
    executor,
    execute,
    sendMessage,
    consent,
    change: () => {
      revision = "inventory-v2";
    },
    cancel: () => {
      current = false;
    },
  };
};
describe("S16 source tools", () => {
  it("withholds bodies before consent and masks search and bounded reads before egress", async () => {
    const test = setup();
    const initial = await test.executor.bootstrap();
    expect(JSON.stringify(initial)).not.toContain("locateReport");
    expect(test.consent).not.toHaveBeenCalled();
    const hits = await test.execute("search_page_resources", {
      query: "locateReport",
    });
    expect(JSON.stringify(hits)).toContain("locateReport");
    expect(JSON.stringify(hits)).not.toContain("RAW_SOURCE_SECRET");
    const chunk = await test.execute("read_page_resource", {
      resource_id: id,
      max_bytes: 40,
    });
    expect(chunk.status).toBe("AVAILABLE");
    expect(JSON.stringify(chunk)).not.toContain("RAW_SOURCE_SECRET");
    expect(chunk.continuation).toBeDefined();
    expect(test.consent).toHaveBeenCalledTimes(1);
    const next = await test.execute("read_page_resource", {
      resource_id: id,
      resource_revision: "body-v1",
      cursor: (chunk.continuation as { cursor: string }).cursor,
    });
    expect(next.status).toBe("AVAILABLE");
  });
  it("accepts legacy optional nulls and the inventory revision for a first read", async () => {
    const test = setup();
    expect(
      await test.execute("list_page_resources", {
        cursor: null,
        page_size: null,
      }),
    ).toMatchObject({ status: "AVAILABLE" });
    expect(
      await test.execute("read_page_resource", {
        resource_id: id,
        resource_revision: "inline-v1",
        cursor: null,
        offset: null,
        max_bytes: 40,
      }),
    ).toMatchObject({ status: "AVAILABLE", resource_revision: "body-v1" });
    const invalid = await test.execute("search_page_resources", {
      query: "locateReport",
      page_size: 20,
    });
    expect(invalid).toMatchObject({
      status: "FAILED",
      code: "INVALID_PAGE_SIZE",
      expected_parameters: { properties: { page_size: { maximum: 8 } } },
    });
  });
  it("denial returns a real DENIED result without collecting a body", async () => {
    const test = setup(false);
    expect(
      await test.execute("read_page_resource", { resource_id: id }),
    ).toEqual({ status: "DENIED" });
    expect(
      test.sendMessage.mock.calls.some(
        ([, message]) =>
          (message as Record<string, unknown>).kind ===
          "CONTENT_PAGE_RESOURCE_READ",
      ),
    ).toBe(false);
  });
  it("invalidates old cursors and consent on source revision drift", async () => {
    const test = setup();
    const chunk = await test.execute("read_page_resource", {
      resource_id: id,
      max_bytes: 40,
    });
    test.change();
    expect(
      await test.execute("read_page_resource", { resource_id: id }),
    ).toMatchObject({ status: "STALE", code: "SOURCE_CHANGED" });
    expect(
      await test.execute("read_page_resource", {
        resource_id: id,
        cursor: (chunk.continuation as { cursor: string }).cursor,
      }),
    ).toMatchObject({ status: "FAILED", code: "INVALID_CURSOR" });
    expect(test.consent).toHaveBeenCalledTimes(1);
  });
  it("rejects forged cursors, malformed arguments and cancelled late results", async () => {
    const test = setup();
    expect(
      await test.execute("list_page_resources", { cursor: "0" }),
    ).toMatchObject({ code: "INVALID_CURSOR" });
    expect(
      await test.execute("read_page_resource", {
        resource_id: id,
        max_bytes: 16385,
      }),
    ).toMatchObject({ code: "INVALID_MAX_BYTES" });
    expect(
      await test.execute("list_page_resources", { hidden: true }),
    ).toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(
      await test.execute("list_page_resources", { constructor: "invalid" }),
    ).toMatchObject({ code: "INVALID_ARGUMENT" });
    test.cancel();
    expect(await test.execute("list_page_resources", {})).toMatchObject({
      status: "CANCELLED",
    });
  });
  it("does not advertise schemas without executors", async () => {
    const registry = createActReadToolRegistry([
      {
        schema: {
          type: "function",
          function: {
            name: "absent",
            description: "Unavailable",
            parameters: {},
          },
        },
        version: 1,
        resultSchema: { type: "object" },
        mode: "act",
        phase: "read",
        consent: "none",
        binding: "request-document",
        budget: "read",
      },
    ]);
    expect(registry.tools).toEqual([]);
    expect(registry.capabilities).toEqual([]);
    expect(
      await registry.execute({ name: "absent", args: "{}" }),
    ).toMatchObject({ status: "UNSUPPORTED" });
  });
  it("waits for single-use consent and rejects another run or post-cancel approval", async () => {
    let requestId = "";
    let current = true;
    const promise = requestSourceConsent({
      runId: "run",
      current: () => current,
      publish: (id) => {
        requestId = id;
      },
    });
    expect(decideSourceConsent(requestId, "wrong-run", true)).toBe(false);
    expect(decideSourceConsent(requestId, "run", true)).toBe(true);
    expect(await promise).toBe(true);
    expect(decideSourceConsent(requestId, "run", true)).toBe(false);
    const cancelled = requestSourceConsent({
      runId: "run",
      current: () => current,
      publish: (id) => {
        requestId = id;
      },
    });
    current = false;
    expect(decideSourceConsent(requestId, "run", true)).toBe(false);
    expect(await cancelled).toBe(false);
  });
  it("returns list-search-read results to their original calls before the fourth model turn", async () => {
    const test = setup();
    const messages: ProviderMessage[] = [{ role: "system", content: "test" }];
    const names = [
      "list_page_resources",
      "search_page_resources",
      "read_page_resource",
    ];
    let turn = 0;
    const result = await runHarnessReadTurns({
      messages,
      offeredTools: [],
      readNames: names,
      executeRead: test.executor.execute,
      serialise: JSON.stringify,
      expectedRevision: 1,
      maxRounds: 12,
      chat: async (thread) => {
        if (turn === 3) {
          expect(
            thread
              .filter((message) => message.role === "tool")
              .map((message) => message.tool_call_id),
          ).toEqual(
            names.map(
              (_, index) => `call-round-${String(index).padStart(12, "0")}`,
            ),
          );
          return { content: "grounded", tool_calls: [] };
        }
        const index = turn++;
        return {
          content: "",
          tool_calls: [
            {
              id: `call-round-${String(index).padStart(12, "0")}`,
              name: names[index]!,
              arguments: JSON.stringify(
                index === 0
                  ? {}
                  : index === 1
                    ? { query: "locateReport" }
                    : { resource_id: id },
              ),
            },
          ],
        };
      },
    });
    expect(result).toMatchObject({
      content: "grounded",
      rounds: 4,
      reads: 3,
      exhausted: false,
    });
  });
  it("stops an oversized read batch before any executor dispatch", async () => {
    const dispatch = vi.fn();
    const result = await runHarnessReadTurns({
      messages: [],
      offeredTools: [],
      readNames: ["read_page"],
      executeRead: dispatch,
      serialise: JSON.stringify,
      expectedRevision: 1,
      maxReads: 1,
      chat: async () => ({
        content: "",
        tool_calls: [0, 1].map((index) => ({
          id: `call-batch-${String(index).padStart(12, "0")}`,
          name: "read_page",
          arguments: "{}",
        })),
      }),
    });
    expect(result.exhausted).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
