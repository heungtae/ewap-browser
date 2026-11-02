import { expect, it, vi } from "vitest";
import {
  injectMainFrame,
  type MainAdmission,
  type MainTransportApi,
} from "../../../../../apps/chrome-extension/src/content/main-transport.js";
function fixture() {
  const binding = {
    documentId: "current-document",
    url: "https://fixture.test/",
    documentLifecycle: "active",
  };
  const getFrame = vi.fn(async () => binding);
  const executeScript = vi.fn(async () => [
    { documentId: binding.documentId, frameId: 0, result: { value: 2 } },
  ]);
  const api: MainTransportApi = {
    webNavigation: { getFrame },
    scripting: { executeScript },
  };
  const controller = new AbortController();
  const admission: MainAdmission = {
    tabId: 1,
    frameId: 0,
    binding,
    deadline: Date.now() + 5000,
    signal: controller.signal,
    current: () => true,
    beforeDispatch: vi.fn(),
  };
  return { api, getFrame, executeScript, admission, controller };
}
it("checks live identity and final caller admission before one document-targeted injection", async () => {
  const f = fixture();
  const func = () => 2;
  expect(await injectMainFrame(f.api, f.admission, func, [])).toEqual({
    value: 2,
  });
  expect(f.admission.beforeDispatch).toHaveBeenCalledOnce();
  expect(f.getFrame).toHaveBeenCalledTimes(2);
  expect(f.executeScript).toHaveBeenCalledExactlyOnceWith({
    target: { tabId: 1, documentIds: ["current-document"] },
    world: "MAIN",
    func,
    args: [],
  });
});
it("rejects stale documents, inactive frames, revoked admission and pre-dispatch cancellation", async () => {
  for (const change of [
    "document",
    "inactive",
    "revoked",
    "abort",
    "lease",
  ] as const) {
    const f = fixture();
    if (change === "document")
      f.getFrame.mockResolvedValue({
        ...f.admission.binding,
        documentId: "new-document",
        documentLifecycle: "active",
      });
    if (change === "inactive")
      f.getFrame.mockResolvedValue({
        ...f.admission.binding,
        documentLifecycle: "cached",
      });
    if (change === "revoked") f.admission.current = () => false;
    if (change === "abort") f.controller.abort();
    if (change === "lease")
      f.admission.beforeDispatch = () => {
        throw Error("PRIVATE_CANARY");
      };
    await expect(
      injectMainFrame(f.api, f.admission, () => 1, []),
    ).rejects.toMatchObject({
      message: "MAIN_INJECTION_DENIED",
      dispatched: false,
    });
    expect(f.executeScript).not.toHaveBeenCalled();
  }
});
it("reports uncertainty without retry after wrong response identity or post-dispatch navigation", async () => {
  for (const change of ["document", "frame", "after"] as const) {
    const f = fixture();
    if (change === "document")
      f.executeScript.mockResolvedValue([
        { documentId: "new-document", frameId: 0, result: { value: 2 } },
      ]);
    if (change === "frame")
      f.executeScript.mockResolvedValue([
        { documentId: "current-document", frameId: 2, result: { value: 2 } },
      ]);
    if (change === "after")
      f.getFrame
        .mockResolvedValueOnce({
          ...f.admission.binding,
          documentLifecycle: "active",
        })
        .mockResolvedValueOnce({
          ...f.admission.binding,
          documentId: "new-document",
          documentLifecycle: "active",
        });
    await expect(
      injectMainFrame(f.api, f.admission, () => 1, []),
    ).rejects.toMatchObject({
      message: "MAIN_INJECTION_UNCERTAIN",
      dispatched: true,
    });
    expect(f.executeScript).toHaveBeenCalledOnce();
  }
});
it("bounds a stalled metadata lookup and prevents late dispatch", async () => {
  vi.useFakeTimers();
  try {
    const f = fixture();
    let release: (() => void) | undefined;
    f.getFrame.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ ...f.admission.binding, documentLifecycle: "active" });
        }),
    );
    f.admission.deadline = Date.now() + 10;
    const result = expect(
      injectMainFrame(f.api, f.admission, () => 1, []),
    ).rejects.toMatchObject({ dispatched: false });
    await vi.advanceTimersByTimeAsync(10);
    await result;
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.executeScript).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
it("preserves dispatch uncertainty on cancellation and ignores late results", async () => {
  const f = fixture();
  let release: (() => void) | undefined;
  f.executeScript.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () =>
          resolve([
            {
              documentId: "current-document",
              frameId: 0,
              result: { value: 2 },
            },
          ]);
      }),
  );
  const result = expect(
    injectMainFrame(f.api, f.admission, () => 1, []),
  ).rejects.toMatchObject({
    dispatched: true,
    message: "MAIN_INJECTION_UNCERTAIN",
  });
  await vi.waitFor(() => expect(f.executeScript).toHaveBeenCalledOnce());
  f.controller.abort();
  await result;
  release?.();
  await Promise.resolve();
  expect(f.executeScript).toHaveBeenCalledOnce();
});
