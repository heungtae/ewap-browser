import { describe, expect, it, vi } from "vitest";
import { createPageResourceExecutor } from "../../../src/service-worker/page-resource-tools.js";
import type { BrowserTabs } from "../../../src/service-worker/browser-api.js";

type Result = {
  status: string;
  code?: string;
  argument_help?: string;
  hits?: Array<{
    resource_id: string;
    resource_revision: string;
    byte_offset: number;
  }>;
  continuation?: {
    tool: string;
    arguments: Record<string, unknown>;
    cursor?: string;
  };
  progress?: {
    inspected_count: number;
    available_count: number;
    unavailable_count: number;
    complete: boolean;
  };
};
const setup = (deny = false) => {
  let revision = "inventory-v1";
  const items = Array.from({ length: 28 }, (_, index) => ({
    resource_id: `resource-${String(index).padStart(16, "0")}`,
    revision: "inline-v1",
    kind: "inline_script",
    byte_length: 300,
    readable: true,
  }));
  const consent = vi.fn(async () => !deny);
  const sendMessage = vi.fn(async (_tab: number, message: unknown) => {
    const input = message as Record<string, unknown>;
    if (input.kind === "CONTENT_PAGE_RESOURCES")
      return {
        document_epoch: "epoch",
        revision,
        items,
        total_count: 28,
        truncated: false,
      };
    return {
      status: "AVAILABLE",
      document_epoch: "epoch",
      inventory_revision: revision,
      resource_id: input.resource_id,
      revision: "body-v1",
      body:
        input.resource_id === items[25]!.resource_id
          ? "function distantCalculation(rows) { return rows.map(row => row.amount * 3); }\n" +
            "// padding\n".repeat(40)
          : "// unrelated script",
    };
  });
  const executor = createPageResourceExecutor({
    tabs: { sendMessage } as unknown as BrowserTabs,
    tabId: 1,
    documentEpoch: "epoch",
    requestRevision: 1,
    current: () => true,
    consent,
  });
  const execute = (name: string, args: Record<string, unknown>) =>
    executor.execute({ name, args: JSON.stringify(args) }) as Promise<Result>;
  const next = (result: Result) =>
    execute(result.continuation!.tool, result.continuation!.arguments);
  return {
    execute,
    next,
    consent,
    sendMessage,
    change: () => {
      revision = "inventory-v2";
    },
  };
};

describe("S16 live pagination regression", () => {
  it("rejects quoted sizes and None cursors without collecting source", async () => {
    const test = setup();
    expect(
      await test.execute("list_page_resources", {
        page_size: "28",
        cursor: "None",
      }),
    ).toMatchObject({
      status: "FAILED",
      code: "INVALID_PAGE_SIZE",
      argument_help: expect.stringContaining("JSON integers"),
    });
    expect(
      await test.execute("list_page_resources", { cursor: "None" }),
    ).toMatchObject({ status: "FAILED", code: "INVALID_CURSOR" });
    expect(test.consent).not.toHaveBeenCalled();
  });

  it("finds and reads a late resource through exact query-bound continuations", async () => {
    const test = setup();
    const list = await test.execute("list_page_resources", {});
    expect((await test.next(list)).progress).toMatchObject({
      inspected_count: 28,
      complete: true,
    });
    expect(
      await test.execute("search_page_resources", {
        query: "distantCalculation",
        cursor: list.continuation!.arguments.cursor,
      }),
    ).toMatchObject({ code: "INVALID_CURSOR" });
    let search = await test.execute("search_page_resources", {
      query: "distantCalculation",
    });
    expect(search.hits).toEqual([]);
    expect(search.progress).toMatchObject({
      inspected_count: 8,
      complete: false,
    });
    const retry = await test.execute("search_page_resources", {
      query: "distantCalculation",
    });
    expect(retry.progress?.inspected_count).toBe(8);
    for (const count of [16, 24, 28]) {
      search = await test.next(search);
      expect(search.progress?.inspected_count).toBe(count);
    }
    expect(search.progress).toMatchObject({
      available_count: 28,
      complete: true,
    });
    const hit = search.hits![0]!;
    const read = await test.execute("read_page_resource", {
      resource_id: hit.resource_id,
      resource_revision: hit.resource_revision,
      offset: hit.byte_offset,
      max_bytes: 40,
    });
    expect(read.status).toBe("AVAILABLE");
    expect(read.continuation!.arguments.cursor).toBe(read.continuation!.cursor);
    expect((await test.next(read)).status).toBe("AVAILABLE");
  });

  it("keeps query progress isolated and rejects old continuations after revision drift", async () => {
    const test = setup();
    const first = await test.execute("search_page_resources", {
      query: "distantCalculation",
    });
    await test.next(first);
    const other = await test.execute("search_page_resources", {
      query: "otherTerm",
    });
    expect(other.progress?.inspected_count).toBe(8);
    expect(
      await test.execute("search_page_resources", {
        query: "otherTerm",
        cursor: first.continuation!.arguments.cursor,
      }),
    ).toMatchObject({ code: "INVALID_CURSOR" });
    test.change();
    expect(await test.next(first)).toMatchObject({ status: "STALE" });
    const fresh = await test.execute("search_page_resources", {
      query: "distantCalculation",
    });
    expect(fresh.progress?.inspected_count).toBe(8);
  });

  it("never counts denied pages as a complete source search", async () => {
    const test = setup(true);
    let search = await test.execute("search_page_resources", {
      query: "distantCalculation",
    });
    while (search.continuation) search = await test.next(search);
    expect(search.progress).toMatchObject({
      inspected_count: 28,
      available_count: 0,
      unavailable_count: 28,
      complete: false,
    });
    expect(
      test.sendMessage.mock.calls.filter(
        ([, message]) =>
          (message as Record<string, unknown>).kind ===
          "CONTENT_PAGE_RESOURCE_READ",
      ),
    ).toHaveLength(0);
  });
});
