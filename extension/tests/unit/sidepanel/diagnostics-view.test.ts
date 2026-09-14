import { afterEach, expect, it, vi } from "vitest";
import { createDiagnosticsView } from "../../../src/sidepanel/diagnostics-view.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("downloads a safe panel failure when no worker request was accepted", async () => {
  vi.useFakeTimers();
  let click: (() => void) | undefined;
  const link = { href: "", download: "", click: vi.fn() };
  const trace = { textContent: "" };
  const createObjectURL = vi
    .fn<(blob: Blob | MediaSource) => string>()
    .mockReturnValue("blob:test");
  vi.spyOn(URL, "createObjectURL").mockImplementation(createObjectURL);
  vi.stubGlobal("document", {
    querySelector: (selector: string) =>
      selector === "#diagnostics-export"
        ? {
            addEventListener: (_event: string, listener: () => void) => {
              click = listener;
            },
          }
        : selector === "#execution-trace"
          ? trace
          : null,
    createElement: () => link,
  });
  const send = vi.fn();
  const view = createDiagnosticsView({
    send,
    current: () => undefined,
    status: vi.fn(),
    activity: vi.fn(),
    active: () => false,
    label: () => "",
    version: () => "test",
    failure: vi.fn(),
  });
  view.failure("PANEL_CONTEXT_UNAVAILABLE");
  click!();
  await Promise.resolve();
  const blob = createObjectURL.mock.calls[0]?.[0] as Blob | undefined;
  expect(blob).toBeDefined();
  expect(JSON.parse(await blob!.text())).toMatchObject({
    panel_failure_code: "PANEL_CONTEXT_UNAVAILABLE",
    extension_version: "test",
    records: [],
    storage_failed: true,
  });
  expect(link.click).toHaveBeenCalledOnce();
  expect(send).not.toHaveBeenCalled();
  expect(trace.textContent).toContain("PANEL_CONTEXT_UNAVAILABLE");
});
