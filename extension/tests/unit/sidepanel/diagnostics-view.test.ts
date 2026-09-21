import { afterEach, expect, it, vi } from "vitest";
import { createDiagnosticsView } from "../../../src/sidepanel/diagnostics-view.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("downloads a safe panel failure when no worker request was accepted", async () => {
  vi.useFakeTimers();
  const link = { href: "", download: "", click: vi.fn() };
  const trace = { textContent: "" };
  const details = {
    hidden: true,
    open: false,
    scrollIntoView: vi.fn(),
  };
  const dialog = { open: false, showModal: vi.fn(), close: vi.fn() };
  const dialogTrace = { textContent: "" };
  const createObjectURL = vi
    .fn<(blob: Blob | MediaSource) => string>()
    .mockReturnValue("blob:test");
  vi.spyOn(URL, "createObjectURL").mockImplementation(createObjectURL);
  vi.stubGlobal("document", {
    querySelector: (selector: string) =>
      selector === "#diagnostics-export"
        ? {
            addEventListener: vi.fn(),
          }
        : selector === "#execution-trace"
          ? trace
          : selector === "#execution-details"
            ? details
            : selector === "#diagnostics-dialog"
              ? dialog
              : selector === "#diagnostics-dialog-trace"
                ? dialogTrace
                : null,
    createElement: () => link,
  });
  const send = vi.fn().mockResolvedValue({
    ok: true,
    data: {
      schema_version: 1,
      extension_version: "test",
      collected_at_ms: 1,
      sections: {
        execution_trace: { status: "collected", data: { records: [] } },
        request: { status: "unavailable", code: "REQUEST_NOT_FOUND" },
        llm_processing: { status: "collected", data: {} },
        llm_memory: { status: "collected", data: { threads: [] } },
        page: { status: "unavailable", code: "CONTENT_SCRIPT_UNAVAILABLE" },
      },
    },
  });
  const view = createDiagnosticsView({
    send,
    current: () => undefined,
    status: vi.fn(),
    activity: vi.fn(),
    active: () => false,
    label: () => "",
    version: () => "test",
    message: (code) => `화면 메시지: ${code}`,
    failure: vi.fn(),
  });
  view.failure("PANEL_CONTEXT_UNAVAILABLE");
  await view.download();
  const blob = createObjectURL.mock.calls[0]?.[0] as Blob | undefined;
  expect(blob).toBeDefined();
  const archive = new TextDecoder().decode(await blob!.arrayBuffer());
  expect(archive).toContain("manifest.json");
  expect(archive).toContain("panel-failures.json");
  expect(archive).toContain("PANEL_CONTEXT_UNAVAILABLE");
  expect(archive).toContain("REQUEST_NOT_FOUND");
  expect(link.click).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledWith({
    schema_version: 1,
    kind: "DIAGNOSTICS_BUNDLE_EXPORT",
  });
  expect(trace.textContent).toContain("PANEL_CONTEXT_UNAVAILABLE");
  view.open();
  expect(details).toMatchObject({ hidden: false, open: true });
  expect(details.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  expect(dialog.showModal).toHaveBeenCalledOnce();
  expect(dialogTrace.textContent).toContain("PANEL_CONTEXT_UNAVAILABLE");
});
