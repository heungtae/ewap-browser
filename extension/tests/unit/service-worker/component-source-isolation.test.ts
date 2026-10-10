import { describe, expect, it } from "vitest";
import type { BrowserTabs } from "../../../src/service-worker/browser-api.js";
import { createPageResourceExecutor } from "../../../src/service-worker/page-resource-tools.js";
it("keeps static source search complete when component discovery alone is truncated", async () => {
  const id = "description-abcdefghijklmnop";
  const inventory = {
    document_epoch: "epoch",
    revision: "revision",
    total_count: 301,
    source_total_count: 1,
    source_truncated: false,
    truncated: true,
    items: [
      {
        resource_id: id,
        revision: "body",
        kind: "page_description",
        byte_length: 6,
        readable: true,
      },
      ...Array.from({ length: 128 }, (_, index) => ({
        resource_id: `component-abcdefghijklmnop-${index}`,
        revision: "component-body",
        kind: "component",
        byte_length: null,
        readable: true,
      })),
    ],
  };
  const executor = createPageResourceExecutor({
    tabs: {
      sendMessage: async (_tab: number, message: unknown) => {
        const request = message as Record<string, unknown>;
        return request.kind === "CONTENT_PAGE_RESOURCES"
          ? inventory
          : {
              status: "AVAILABLE",
              document_epoch: "epoch",
              inventory_revision: "revision",
              resource_id: id,
              revision: "body",
              body: "public",
            };
      },
    } as unknown as BrowserTabs,
    tabId: 1,
    documentEpoch: "epoch",
    requestRevision: 1,
    current: () => true,
    consent: async () => {
      throw Error("component must not trigger source consent");
    },
  });
  const result = await executor.execute({
    name: "search_page_resources",
    args: JSON.stringify({ query: "missing" }),
  });
  expect(result).toMatchObject({
    status: "AVAILABLE",
    coverage: { complete: true, total_count: 1, truncated: false },
  });
  expect(
    await executor.execute({
      name: "read_page_resource",
      args: JSON.stringify({ resource_id: inventory.items[1]?.resource_id }),
    }),
  ).toMatchObject({ status: "UNSUPPORTED" });
});
describe("component metadata bootstrap", () => {
  it("reports supported component metadata as available without source disclosure consent", async () => {
    const executor = createPageResourceExecutor({
      tabs: {
        sendMessage: async () => ({
          document_epoch: "epoch",
          revision: "revision",
          total_count: 1,
          truncated: false,
          items: [
            {
              resource_id: "component-abcdefghijklmnop",
              revision: "component-body",
              kind: "component",
              byte_length: null,
              readable: true,
            },
          ],
        }),
      } as unknown as BrowserTabs,
      tabId: 1,
      documentEpoch: "epoch",
      requestRevision: 1,
      current: () => true,
      consent: async () => false,
    });
    expect((await executor.bootstrap()).items[0]).toMatchObject({
      state: "AVAILABLE",
    });
  });
});
