import { expect, it, vi } from "vitest";
import type { collect as Collector } from "../../../../../packages/collector/src/index.js";
const collect = vi.fn<typeof Collector>();
import {
  installContentCollector,
  type CollectorRuntime,
} from "../../../../../apps/chrome-extension/src/codebase/content-collector.js";
import { batch } from "./support.js";
const id = "a".repeat(32),
  url = "https://fixture.test/search?q=one";
const sender = { id, url: `chrome-extension://${id}/js/service-worker.js` };
async function fixture() {
  vi.mocked(collect).mockReset();
  const result = await batch();
  vi.mocked(collect).mockResolvedValue(result);
  let listener:
    | Parameters<CollectorRuntime["onMessage"]["addListener"]>[0]
    | undefined;
  const runtime: CollectorRuntime = {
    id,
    onMessage: {
      addListener: (fn) => {
        listener = fn;
      },
      removeListener: () => {
        listener = undefined;
      },
    },
  };
  const document = { URL: url };
  const root = vi.fn(() => ({ ownerDocument: document }) as unknown as Element);
  const dispose = installContentCollector(runtime, root, collect);
  const request = {
    kind: "wca.codebase.collect",
    requestId: crypto.randomUUID(),
    url,
    batchId: result.batchId,
    context: result.context,
    expectedRevision: 0,
    scope: result.scope,
    deadline: Date.now() + 10000,
  };
  const send = (value: unknown, from: typeof sender = sender) =>
    new Promise<Record<string, unknown>>((resolve) =>
      listener!(value, from, (v) => resolve(v as Record<string, unknown>)),
    );
  return { request, send, root, result, dispose, document };
}
it("accepts only the Worker endpoint before accessing the DOM", async () => {
  const f = await fixture();
  for (const from of [
    { ...sender, id: "b".repeat(32) },
    { ...sender, url: `chrome-extension://${id}/settings/index.html` },
    { ...sender, tab: { id: 1 } },
  ])
    expect(await f.send(f.request, from)).toEqual({
      ok: false,
      code: "COLLECTOR_DENIED",
    });
  expect(f.root).not.toHaveBeenCalled();
  expect(collect).not.toHaveBeenCalled();
  expect(await f.send(f.request)).toEqual({ ok: true, batch: f.result });
  expect(await f.send(f.request)).toEqual({
    ok: false,
    code: "COLLECTOR_DENIED",
  });
  f.dispose();
});
it("rejects changed routes, extra authority fields and elapsed deadlines", async () => {
  const f = await fixture();
  for (const patch of [
    { url: url + "#other" },
    { readAllowed: true },
    { deadline: Date.now() - 1 },
  ])
    expect(await f.send({ ...f.request, ...patch })).toEqual({
      ok: false,
      code: "COLLECTOR_DENIED",
    });
  expect(collect).not.toHaveBeenCalled();
  f.dispose();
});
it("cancels a matching pending read and returns a masked terminal error", async () => {
  const f = await fixture();
  vi.mocked(collect).mockImplementation(
    (_root, options) =>
      new Promise((_resolve, reject) =>
        options.signal!.addEventListener(
          "abort",
          () => reject(new Error("PRIVATE_PAGE_CANARY")),
          { once: true },
        ),
      ),
  );
  const pending = f.send(f.request);
  expect(
    await f.send({
      kind: "wca.codebase.cancel",
      requestId: f.request.requestId,
    }),
  ).toEqual({ ok: true });
  expect(await pending).toEqual({ ok: false, code: "COLLECTOR_UNAVAILABLE" });
  f.dispose();
});
