import { expect, it, vi } from "vitest";
import { ChromeCollector } from "../../../../../apps/chrome-extension/src/codebase/chrome-collector.js";
import type { DiscoveryAdmission } from "../../../../../apps/chrome-extension/src/codebase/discover.js";
import { batch } from "./support.js";
async function fixture() {
  const value = await batch();
  const frame = {
    documentId: "document-one",
    url: "https://fixture.test/search?q=one",
    documentLifecycle: "active",
  };
  const controller = new AbortController();
  const admission: DiscoveryAdmission = {
    batchId: value.batchId,
    context: value.context,
    deadline: Date.now() + 10000,
    readAllowed: true,
    scope: value.scope,
    signal: controller.signal,
    expectedRevision: value.expectedRevision,
  };
  const getFrame = vi.fn(async () => frame);
  const sendMessage = vi.fn(async () => ({ ok: true, batch: value }));
  const listeners = new Set<
    (info: { tabId: number; frameId: number }) => void
  >();
  const event = {
    addListener: (fn: (info: { tabId: number; frameId: number }) => void) => {
      listeners.add(fn);
    },
    removeListener: (
      fn: (info: { tabId: number; frameId: number }) => void,
    ) => {
      listeners.delete(fn);
    },
  };
  const port = new ChromeCollector(
    {
      webNavigation: {
        getFrame,
        onBeforeNavigate: event,
        onCommitted: event,
        onHistoryStateUpdated: event,
        onReferenceFragmentUpdated: event,
      },
      tabs: {
        sendMessage,
        onRemoved: { addListener: () => {}, removeListener: () => {} },
      },
    },
    frame,
  );
  return {
    value,
    frame,
    controller,
    admission,
    getFrame,
    sendMessage,
    port,
    listeners,
  };
}
it("targets the freshly verified Chrome document and validates returned scope", async () => {
  const f = await fixture();
  expect(await f.port.collect(f.admission)).toEqual(f.value);
  expect(f.sendMessage.mock.calls[0]).toEqual([
    1,
    expect.objectContaining({
      kind: "wca.codebase.collect",
      context: f.value.context,
    }),
    { documentId: "document-one" },
  ]);
  expect(f.getFrame).toHaveBeenCalledTimes(2);
});
it("denies missing read consent, cancellation and stale document/URL before messaging", async () => {
  for (const mode of ["consent", "cancel", "document", "route", "prerender"]) {
    const f = await fixture();
    if (mode === "consent") f.admission.readAllowed = false;
    if (mode === "cancel") f.controller.abort();
    if (mode === "document")
      f.getFrame.mockResolvedValue({ ...f.frame, documentId: "new" });
    if (mode === "route")
      f.getFrame.mockResolvedValue({
        ...f.frame,
        url: "https://fixture.test/other",
      });
    if (mode === "prerender")
      f.getFrame.mockResolvedValue({
        ...f.frame,
        documentLifecycle: "prerender",
      });
    await expect(f.port.collect(f.admission)).rejects.toThrow();
    expect(f.sendMessage).not.toHaveBeenCalled();
  }
});
it("rejects context/scope mismatches and navigation during collection", async () => {
  for (const mode of ["context", "scope", "navigation"]) {
    const f = await fixture();
    if (mode === "context")
      f.sendMessage.mockResolvedValue({
        ok: true,
        batch: {
          ...f.value,
          context: { ...f.value.context, pageKey: "other_page" },
        },
      });
    if (mode === "scope")
      f.sendMessage.mockResolvedValue({
        ok: true,
        batch: { ...f.value, scope: "all_dom" },
      });
    if (mode === "navigation")
      f.getFrame
        .mockResolvedValueOnce(f.frame)
        .mockResolvedValueOnce({ ...f.frame, documentId: "new" });
    await expect(f.port.collect(f.admission)).rejects.toThrow();
  }
});
it("cancels a pending document-targeted read and sends a matching bounded cancellation", async () => {
  const f = await fixture();
  f.sendMessage.mockImplementation(() => new Promise(() => {}));
  const pending = f.port.collect(f.admission);
  for (let n = 0; n < 8; n++) await Promise.resolve();
  expect(f.sendMessage).toHaveBeenCalledTimes(1);
  f.controller.abort();
  await expect(pending).rejects.toThrow("COLLECTION_CANCELLED");
  expect(f.sendMessage.mock.calls[1]).toEqual([
    1,
    expect.objectContaining({
      kind: "wca.codebase.cancel",
      requestId: expect.any(String),
    }),
    { documentId: "document-one" },
  ]);
});

it("invalidates live read handles on navigation, including a change and revert", async () => {
  const f = await fixture();
  await f.port.collect(f.admission);
  for (const listener of f.listeners) listener({ tabId: 1, frameId: 0 });
  expect(f.port.isCurrent()).toBe(false);
  await expect(f.port.collect(f.admission)).rejects.toThrow();
  f.port.dispose();
  expect(f.listeners.size).toBe(0);
});

it("masks malformed response details at the transport boundary", async () => {
  const f = await fixture();
  f.sendMessage.mockResolvedValue({
    ok: true,
    batch: { ...f.value, batchId: "PRIVATE_CANARY" },
  });
  await expect(f.port.collect(f.admission)).rejects.toThrow(
    "COLLECTOR_INVALID_RESPONSE",
  );
});

it("bounds a stalled Chrome frame lookup before sending any collection", async () => {
  const f = await fixture();
  vi.useFakeTimers();
  try {
    f.getFrame.mockImplementation(() => new Promise(() => {}));
    const pending = f.port.collect(f.admission);
    const check = expect(pending).rejects.toThrow("COLLECTION_CANCELLED");
    await vi.advanceTimersByTimeAsync(10001);
    await check;
    expect(f.sendMessage).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
    f.port.dispose();
  }
});
